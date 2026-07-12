#!/usr/bin/env node

import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { homedir, platform, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SCORE_KEYS = [
  "taskFulfillment",
  "factualFidelity",
  "attentionStructure",
  "proseQuality",
  "constraintCompliance",
  "voicePreservation",
];
const ALLOWED_ITEM_TYPES = new Set([
  "userMessage",
  "agentMessage",
  "reasoning",
  "plan",
  "contextCompaction",
  "skill",
]);

function parseArgs(argv) {
  const options = {
    model: "gpt-5.6-sol",
    effort: "ultra",
    judges: 4,
    cases: join(HERE, "suites", "holdout-v1.json"),
    skill: join(ROOT, "SKILL.md"),
    out: null,
    keepTemp: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--model") options.model = argv[++i];
    else if (arg === "--effort") options.effort = argv[++i];
    else if (arg === "--judges") options.judges = Number(argv[++i]);
    else if (arg === "--cases") options.cases = resolve(argv[++i]);
    else if (arg === "--skill") options.skill = resolve(argv[++i]);
    else if (arg === "--out") options.out = resolve(argv[++i]);
    else if (arg === "--keep-temp") options.keepTemp = true;
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write(`Usage: node evals/run-eval.mjs [options]\n\n` +
        `  --model <id>       Model id (default: gpt-5.6-sol)\n` +
        `  --effort <level>   Reasoning effort (default: ultra)\n` +
        `  --judges <n>       Blind judges per pair (default: 4)\n` +
        `  --cases <path>     Frozen case file\n` +
        `  --skill <path>     SKILL.md treatment path\n` +
        `  --out <path>       Write JSON to a file instead of stdout\n` +
        `  --keep-temp        Keep isolated temporary directories\n`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.judges) || options.judges < 1) {
    throw new Error("--judges must be a positive integer");
  }
  return options;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function countWords(value) {
  const matches = value.trim().match(/\b[\p{L}\p{N}][\p{L}\p{N}'’.-]*\b/gu);
  return matches ? matches.length : 0;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function sumScores(scores) {
  return SCORE_KEYS.reduce((sum, key) => sum + Number(scores[key] ?? 0), 0);
}

function publicThreadRef(threadId) {
  return `thread-${sha256(threadId).slice(0, 12)}`;
}

function publicError(error) {
  return String(error?.message ?? error)
    .replace(/\/(?:Users|home|tmp|private\/tmp|var\/folders)\/[^\s"',)\]]+/g, "<redacted-path>")
    .replace(/[A-Za-z]:\\[^\s"',)\]]+/g, "<redacted-path>")
    .slice(0, 1000);
}

class AppServerClient extends EventEmitter {
  constructor(child) {
    super();
    this.child = child;
    this.nextId = 1;
    this.pending = new Map();
    this.turnState = new Map();
    this.stderr = [];
    this.deadError = null;

    const stdout = createInterface({ input: child.stdout });
    stdout.on("line", (line) => this.onLine(line));

    const stderr = createInterface({ input: child.stderr });
    stderr.on("line", (line) => {
      this.stderr.push(line);
      if (this.stderr.length > 100) this.stderr.shift();
    });

    child.on("exit", (code, signal) => {
      const error = new Error(`codex app-server exited (code=${code}, signal=${signal})`);
      this.deadError = error;
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(error);
      }
      this.pending.clear();
      for (const state of this.turnState.values()) {
        for (const waiter of state.waiters ?? []) {
          clearTimeout(waiter.timer);
          waiter.reject(error);
        }
        state.waiters = [];
      }
      this.emit("exit", error);
    });
    child.on("error", (error) => {
      this.deadError = error;
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(error);
      }
      this.pending.clear();
      for (const state of this.turnState.values()) {
        for (const waiter of state.waiters ?? []) {
          clearTimeout(waiter.timer);
          waiter.reject(error);
        }
        state.waiters = [];
      }
      this.emit("exit", error);
    });
  }

  onLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }

    if (message.id !== undefined && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
      return;
    }

    if (message.method) {
      this.handleNotification(message);
      this.emit("notification", message);
      if (message.id !== undefined) {
        this.send({
          id: message.id,
          error: { code: -32601, message: `Unsupported server request: ${message.method}` },
        });
      }
    }
  }

  handleNotification(message) {
    const params = message.params ?? {};
    const turnId = params.turnId ?? params.turn?.id;
    if (!turnId) return;

    const state = this.turnState.get(turnId) ?? {
      messages: [],
      completed: false,
      status: null,
      error: null,
      itemTypes: new Set(),
      reroutes: [],
      waiters: [],
    };

    if ((message.method === "item/started" || message.method === "item/completed") && params.item?.type) {
      state.itemTypes.add(params.item.type);
    }

    if (message.method === "item/completed" && params.item?.type === "agentMessage") {
      state.messages.push({
        phase: params.item.phase ?? null,
        text: params.item.text ?? "",
      });
    }

    if (message.method === "turn/completed") {
      state.completed = true;
      state.status = params.turn?.status ?? "unknown";
      state.error = params.turn?.error ?? null;
      for (const waiter of state.waiters) {
        clearTimeout(waiter.timer);
        waiter.resolve();
      }
      state.waiters = [];
    }

    if (message.method === "model/rerouted") {
      state.reroutes.push({
        fromModel: params.fromModel ?? null,
        toModel: params.toModel ?? null,
        reason: params.reason ?? null,
      });
    }

    this.turnState.set(turnId, state);
  }

  send(message) {
    if (this.deadError || this.child.exitCode !== null || this.child.signalCode !== null) {
      throw this.deadError ?? new Error("codex app-server is not running");
    }
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  request(method, params = {}, timeoutMs = 120_000) {
    if (this.deadError || this.child.exitCode !== null || this.child.signalCode !== null) {
      return Promise.reject(this.deadError ?? new Error("codex app-server is not running"));
    }
    const id = this.nextId++;
    return new Promise((resolveRequest, rejectRequest) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectRequest(new Error(`RPC timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolveRequest, reject: rejectRequest, timer });
      try {
        this.send({ method, id, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        rejectRequest(error);
      }
    });
  }

  notify(method, params = {}) {
    this.send({ method, params });
  }

  isAlive() {
    return !this.deadError && this.child.exitCode === null && this.child.signalCode === null;
  }

  async waitForTurn(turnId, timeoutMs = 900_000) {
    const state = this.turnState.get(turnId);
    if (state?.completed) return this.finalTurn(turnId);

    await new Promise((resolveWaiter, rejectWaiter) => {
      const timer = setTimeout(() => {
        const current = this.turnState.get(turnId);
        if (current) current.waiters = current.waiters.filter((waiter) => waiter.timer !== timer);
        rejectWaiter(new Error(`Turn timeout: ${turnId}`));
      }, timeoutMs);
      const current = this.turnState.get(turnId) ?? {
        messages: [],
        completed: false,
        status: null,
        error: null,
        itemTypes: new Set(),
        reroutes: [],
        waiters: [],
      };
      current.waiters.push({ resolve: resolveWaiter, reject: rejectWaiter, timer });
      this.turnState.set(turnId, current);
    });

    return this.finalTurn(turnId);
  }

  finalTurn(turnId) {
    const state = this.turnState.get(turnId);
    if (state?.status !== "completed") {
      throw new Error(`Turn ${turnId} ended with status ${state?.status}: ${JSON.stringify(state?.error)}`);
    }
    const final = [...(state?.messages ?? [])].reverse().find((item) => item.phase === "final_answer")
      ?? [...(state?.messages ?? [])].reverse()[0];
    if (!final?.text) throw new Error(`Turn ${turnId} completed without a final agent message`);
    return {
      text: final.text,
      itemTypes: [...(state?.itemTypes ?? [])].sort(),
      reroutes: state?.reroutes ?? [],
    };
  }

  async close() {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    await new Promise((resolveClose) => {
      const timer = setTimeout(() => {
        if (this.child.exitCode === null && this.child.signalCode === null) this.child.kill("SIGKILL");
      }, 5_000);
      this.child.once("exit", () => {
        clearTimeout(timer);
        resolveClose();
      });
      this.child.kill("SIGTERM");
    });
  }
}

async function prepareIsolatedEnvironment() {
  const cleanHome = await mkdtemp(join(tmpdir(), "addictive-writing-codex-home-"));
  const cleanWorkspace = await mkdtemp(join(tmpdir(), "addictive-writing-workspace-"));
  const skillInputRoot = await mkdtemp(join(tmpdir(), "addictive-writing-skill-input-"));
  const sourceHome = process.env.CODEX_HOME || join(homedir(), ".codex");
  const sourceAuth = join(sourceHome, "auth.json");
  try {
    await access(sourceAuth);
    await symlink(sourceAuth, join(cleanHome, "auth.json"));
    return { cleanHome, cleanWorkspace, skillInputRoot };
  } catch (error) {
    await rm(cleanHome, { recursive: true, force: true });
    await rm(cleanWorkspace, { recursive: true, force: true });
    await rm(skillInputRoot, { recursive: true, force: true });
    throw error;
  }
}

async function startClient(options, cleanHome, cleanWorkspace) {
  const childEnv = {
    PATH: process.env.PATH,
    HOME: cleanHome,
    CODEX_HOME: cleanHome,
    TMPDIR: process.env.TMPDIR || tmpdir(),
    SHELL: process.env.SHELL || "/bin/sh",
    LANG: process.env.LANG || "C.UTF-8",
    LC_ALL: process.env.LC_ALL || "",
    USER: process.env.USER || "eval",
    LOGNAME: process.env.LOGNAME || process.env.USER || "eval",
  };
  const child = spawn(
    "codex",
    [
      "app-server",
      "--stdio",
      "--disable",
      "shell_tool",
      "--disable",
      "apps",
      "-c",
      `model=\"${options.model}\"`,
      "-c",
      `model_reasoning_effort=\"${options.effort}\"`,
      "-c",
      "web_search=\"disabled\"",
    ],
    {
      cwd: cleanWorkspace,
      env: childEnv,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  const client = new AppServerClient(child);
  try {
    const initialized = await client.request("initialize", {
      clientInfo: {
        name: "addictive_writing_eval",
        title: "Addictive Writing Evaluation",
        version: "1.0.0",
      },
    });
    client.notify("initialized", {});
    return { client, initialized };
  } catch (error) {
    await client.close();
    throw error;
  }
}

function buildTaskPrompt(testCase) {
  return [
    "Complete this writing task using only the materials below.",
    "Do not use tools, inspect files, mention the evaluation, or add commentary outside the requested deliverable.",
    "",
    "TASK",
    testCase.task,
    "",
    testCase.materials,
  ].join("\n");
}

async function startThread(client, options, cleanWorkspace) {
  const result = await client.request("thread/start", {
    model: options.model,
    cwd: cleanWorkspace,
    approvalPolicy: "never",
    sandbox: "read-only",
    serviceName: "addictive-writing-eval",
  });
  if (result.model !== options.model) {
    throw new Error(`Thread model mismatch: requested ${options.model}, got ${result.model}`);
  }
  if (result.reasoningEffort !== options.effort) {
    throw new Error(`Thread effort mismatch: requested ${options.effort}, got ${result.reasoningEffort}`);
  }
  return result;
}

async function runTurn(client, threadId, options, input, outputSchema = undefined) {
  const params = {
    threadId,
    input,
    model: options.model,
    effort: options.effort,
  };
  if (outputSchema) params.outputSchema = outputSchema;
  const result = await client.request("turn/start", params);
  let completed;
  try {
    completed = await client.waitForTurn(result.turn.id);
  } catch (error) {
    if (String(error.message).startsWith("Turn timeout:") && client.isAlive()) {
      try {
        await client.request("turn/interrupt", { threadId, turnId: result.turn.id }, 30_000);
      } catch {
        // The original turn error is more useful than a best-effort interrupt error.
      }
    }
    throw error;
  }
  if (completed.reroutes.length) {
    throw new Error(`Model rerouted: ${JSON.stringify(completed.reroutes)}`);
  }
  const disallowedItems = completed.itemTypes.filter((type) => !ALLOWED_ITEM_TYPES.has(type));
  if (disallowedItems.length) {
    throw new Error(`Disallowed tool or mode items: ${disallowedItems.join(", ")}`);
  }
  return { turnId: result.turn.id, text: completed.text, itemTypes: completed.itemTypes };
}

async function generateCondition(client, options, cleanWorkspace, testCase, condition, retryLog) {
  const prompt = buildTaskPrompt(testCase);
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const thread = await startThread(client, options, cleanWorkspace);
      const input = condition === "skill"
        ? [
            { type: "text", text: `$addictive-writing\n\n${prompt}` },
            { type: "skill", name: "addictive-writing", path: options.runtimeSkill },
          ]
        : [{ type: "text", text: prompt }];
      const turn = await runTurn(client, thread.thread.id, options, input);
      return {
        condition,
        threadRef: publicThreadRef(thread.thread.id),
        multiAgentMode: thread.multiAgentMode ?? null,
        promptHash: sha256(prompt),
        skillInputSent: condition === "skill",
        output: turn.text,
        wordCount: countWords(turn.text),
        deterministicChecks: deterministicChecks(testCase, turn.text),
        observedItemTypes: turn.itemTypes,
      };
    } catch (error) {
      retryLog.push({ stage: "generation", caseId: testCase.id, condition, attempt, error: publicError(error) });
      const evidenceRelevantFailure = /^(Disallowed tool or mode items|Model rerouted):/.test(error.message);
      if (attempt === 2 || evidenceRelevantFailure) throw error;
    }
  }
  throw new Error("unreachable");
}

function scoreSchema(testCase) {
  const checkIds = testCase.objectiveChecks.map((check) => check.id);
  const scoreProperties = Object.fromEntries(
    SCORE_KEYS.map((key) => [key, { type: "integer", minimum: 0, maximum: 10 }]),
  );
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "caseId",
      "scoresA",
      "scoresB",
      "checksA",
      "checksB",
      "preferred",
      "confidence",
      "rationale",
    ],
    properties: {
      caseId: { type: "string", enum: [testCase.id] },
      scoresA: { type: "object", additionalProperties: false, required: SCORE_KEYS, properties: scoreProperties },
      scoresB: { type: "object", additionalProperties: false, required: SCORE_KEYS, properties: scoreProperties },
      checksA: {
        type: "array",
        minItems: checkIds.length,
        maxItems: checkIds.length,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["checkId", "pass", "evidence"],
          properties: {
            checkId: { type: "string", enum: checkIds },
            pass: { type: "boolean" },
            evidence: { type: "string" },
          },
        },
      },
      checksB: {
        type: "array",
        minItems: checkIds.length,
        maxItems: checkIds.length,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["checkId", "pass", "evidence"],
          properties: {
            checkId: { type: "string", enum: checkIds },
            pass: { type: "boolean" },
            evidence: { type: "string" },
          },
        },
      },
      preferred: { type: "string", enum: ["A", "B", "tie"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      rationale: { type: "string" },
    },
  };
}

function buildJudgePrompt(testCase, outputA, outputB) {
  const checks = testCase.objectiveChecks
    .map((check) => `- ${check.id} (${check.hard ? "hard" : "diagnostic"}): ${check.description}`)
    .join("\n");
  return [
    "You are a blind evaluator. The two outputs came from the same model under two undisclosed conditions.",
    "Judge only against the frozen task and source materials. Do not use tools or inspect files.",
    "First apply every objective check. Then score each output independently on six 0–10 dimensions.",
    "Anchors: 0 = severe failure, 5 = mixed/partial, 10 = fully satisfies the task.",
    "Factual fidelity and constraint compliance are hard gates. Do not reward attention or style that violates the task.",
    "Choose A, B, or tie; give confidence from 0 to 1 and a concise evidence-based rationale.",
    `Case-specific guidance: ${testCase.judgeGuidance}`,
    "",
    "TASK",
    testCase.task,
    "",
    testCase.materials,
    "",
    "OBJECTIVE CHECKS",
    checks,
    "",
    "OUTPUT A",
    outputA,
    "",
    "OUTPUT B",
    outputB,
  ].join("\n");
}

function deterministicChecks(testCase, output) {
  const result = {};
  const words = countWords(output);
  const normalized = output
    .trim()
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ");

  if (testCase.id === "short-form-script") {
    result["word-range"] = { pass: words >= 110 && words <= 150, evidence: `${words} words` };
  } else if (testCase.id === "incident-case-study") {
    result["word-range"] = { pass: words >= 130 && words <= 170, evidence: `${words} words` };
  } else if (testCase.id === "fiction-earned-reveal") {
    result["word-range"] = { pass: words >= 180 && words <= 230, evidence: `${words} words` };
  } else if (testCase.id === "review-without-rewriting") {
    result["word-limit"] = { pass: words <= 250, evidence: `${words} words` };
  } else if (testCase.id === "evidence-memo-review") {
    result["word-limit"] = { pass: words <= 220, evidence: `${words} words` };
  } else if (testCase.id === "qualified-newsletter") {
    result["word-range"] = { pass: words >= 120 && words <= 160, evidence: `${words} words` };
  } else if (testCase.id === "grammar-only-control") {
    result["committee-was"] = {
      pass: /\bthe committee was meeting\b/i.test(normalized),
      evidence: "Expected singular agreement: 'the committee was meeting'.",
    };
    result["each-has"] = {
      pass: /\bEach of the three options has\b/.test(normalized),
      evidence: "Expected singular agreement: 'Each ... has'.",
    };
    result["estimates-do-not"] = {
      pass: /\bthe estimates (?:don't|do not) include tax\b/i.test(normalized),
      evidence: "Expected plural agreement: estimates don't/do not include.",
    };
    result["figures-were"] = {
      pass: /\bthe figures were final\b/i.test(normalized),
      evidence: "Expected plural agreement: 'figures were'.",
    };
    const accepted = [
      "Last Tuesday, the committee was meeting to review the proposal. Each of the three options has a different cost, and the estimates don't include tax. The chair asked whether the figures were final; the finance team said they weren't.",
      "Last Tuesday, the committee was meeting to review the proposal. Each of the three options has a different cost, and the estimates do not include tax. The chair asked whether the figures were final; the finance team said they weren't.",
    ];
    result["no-style-rewrite"] = {
      pass: accepted.includes(normalized),
      evidence: accepted.includes(normalized)
        ? "Output exactly matches an accepted minimal correction."
        : "Output differs from the accepted minimal corrections after whitespace and apostrophe normalization.",
    };
  } else if (testCase.id === "grammar-holdout-control") {
    result["neither-includes"] = {
      pass: /\bNeither of the revised budgets includes contractor fees\b/i.test(normalized),
      evidence: "Expected singular agreement: 'Neither ... includes'.",
    };
    result["list-was"] = {
      pass: /\bThe list of assumptions was attached\b/i.test(normalized),
      evidence: "Expected singular agreement: 'The list ... was'.",
    };
    result["one-is"] = {
      pass: /\bone of the tabs is missing\b/i.test(normalized),
      evidence: "Expected singular agreement: 'one ... is'.",
    };
    result["figures-are"] = {
      pass: /\bthe figures are preliminary\b/i.test(normalized),
      evidence: "Expected plural agreement: 'figures are'.",
    };
    const accepted = "Neither of the revised budgets includes contractor fees. The list of assumptions was attached, but one of the tabs is missing. The analyst said the figures are preliminary.";
    result["no-style-rewrite"] = {
      pass: normalized === accepted,
      evidence: normalized === accepted
        ? "Output exactly matches the accepted minimal correction."
        : "Output differs from the accepted minimal correction after whitespace and apostrophe normalization.",
    };
  }
  return result;
}

function validateJudgment(judgment, testCase) {
  const expectedIds = testCase.objectiveChecks.map((check) => check.id).sort();
  for (const label of ["A", "B"]) {
    const scores = judgment[`scores${label}`];
    for (const key of SCORE_KEYS) {
      if (!Number.isInteger(scores?.[key]) || scores[key] < 0 || scores[key] > 10) {
        throw new Error(`Invalid ${label} score for ${key}`);
      }
    }
    const checks = judgment[`checks${label}`];
    if (!Array.isArray(checks) || checks.length !== expectedIds.length) {
      throw new Error(`Output ${label} must return exactly ${expectedIds.length} checks`);
    }
    const actualIds = checks.map((check) => check.checkId).sort();
    if (new Set(actualIds).size !== actualIds.length || JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
      throw new Error(`Output ${label} returned missing, duplicate, or unexpected check ids`);
    }
  }
  if (!new Set(["A", "B", "tie"]).has(judgment.preferred)) throw new Error("Invalid preferred value");
  if (typeof judgment.confidence !== "number" || judgment.confidence < 0 || judgment.confidence > 1) {
    throw new Error("Invalid confidence value");
  }
}

async function judgePair(client, options, cleanWorkspace, testCase, generation, judgeIndex, retryLog) {
  const skillIsA = (testCase.index + judgeIndex) % 2 === 0;
  const outputA = skillIsA ? generation.skill.output : generation.baseline.output;
  const outputB = skillIsA ? generation.baseline.output : generation.skill.output;
  const prompt = buildJudgePrompt(testCase, outputA, outputB);

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const thread = await startThread(client, options, cleanWorkspace);
      const turn = await runTurn(
        client,
        thread.thread.id,
        options,
        [{ type: "text", text: prompt }],
        scoreSchema(testCase),
      );
      const parsed = JSON.parse(turn.text);
      validateJudgment(parsed, testCase);
      return {
        judge: judgeIndex + 1,
        threadRef: publicThreadRef(thread.thread.id),
        multiAgentMode: thread.multiAgentMode ?? null,
        blindOrder: {
          A: skillIsA ? "skill" : "baseline",
          B: skillIsA ? "baseline" : "skill",
        },
        promptHash: sha256(prompt),
        judgment: parsed,
        observedItemTypes: turn.itemTypes,
      };
    } catch (error) {
      retryLog.push({ stage: "judgment", caseId: testCase.id, judge: judgeIndex + 1, attempt, error: publicError(error) });
      const evidenceRelevantFailure = /^(Disallowed tool or mode items|Model rerouted):/.test(error.message);
      if (attempt === 2 || evidenceRelevantFailure) throw error;
    }
  }
  throw new Error("unreachable");
}

function checksForCondition(judge, condition) {
  return judge.blindOrder.A === condition ? judge.judgment.checksA : judge.judgment.checksB;
}

function scoresForCondition(judge, condition) {
  return judge.blindOrder.A === condition ? judge.judgment.scoresA : judge.judgment.scoresB;
}

function preferenceCondition(judge) {
  if (judge.judgment.preferred === "tie") return "tie";
  return judge.blindOrder[judge.judgment.preferred];
}

function checkPassVotes(judges, condition, checkId) {
  return judges.map((judge) => {
    const match = checksForCondition(judge, condition).find((check) => check.checkId === checkId);
    return match?.pass === true;
  }).filter(Boolean).length;
}

function summarizeCase(testCase, run) {
  const { judges, generation } = run;
  const totals = { baseline: [], skill: [] };
  const dimensions = {
    baseline: Object.fromEntries(SCORE_KEYS.map((key) => [key, []])),
    skill: Object.fromEntries(SCORE_KEYS.map((key) => [key, []])),
  };
  const votes = { baseline: 0, skill: 0, tie: 0 };

  for (const judge of judges) {
    for (const condition of ["baseline", "skill"]) {
      const scores = scoresForCondition(judge, condition);
      totals[condition].push(sumScores(scores));
      for (const key of SCORE_KEYS) dimensions[condition][key].push(scores[key]);
    }
    votes[preferenceCondition(judge)] += 1;
  }

  const checks = Object.fromEntries(testCase.objectiveChecks.map((check) => {
    const baselinePassVotes = checkPassVotes(judges, "baseline", check.id);
    const skillPassVotes = checkPassVotes(judges, "skill", check.id);
    return [
      check.id,
      {
        hard: check.hard,
        baselinePassVotes,
        skillPassVotes,
        judgeCount: judges.length,
        baselineMajorityPass: baselinePassVotes > judges.length / 2,
        skillMajorityPass: skillPassVotes > judges.length / 2,
        baselineDeterministic: generation.baseline.deterministicChecks[check.id] ?? null,
        skillDeterministic: generation.skill.deterministicChecks[check.id] ?? null,
      },
    ];
  }));
  const hardChecks = Object.values(checks).filter((check) => check.hard);
  const noHardRegression = hardChecks.every((check) => {
    const judgeNoRegression = check.skillPassVotes >= check.baselinePassVotes;
    const deterministicNoRegression = check.baselineDeterministic?.pass !== true
      || check.skillDeterministic?.pass === true;
    return judgeNoRegression && deterministicNoRegression;
  });
  const allSkillHardChecksPass = hardChecks.every((check) => (
    check.skillMajorityPass && (check.skillDeterministic === null || check.skillDeterministic.pass === true)
  ));
  const positiveSuccess = votes.skill > votes.baseline && noHardRegression && allSkillHardChecksPass;
  const negativeSuccess = allSkillHardChecksPass && noHardRegression && votes.baseline <= votes.skill;

  return {
    caseId: testCase.id,
    type: testCase.type,
    votes,
    baseline: {
      meanTotal: round(mean(totals.baseline)),
      medianTotal: round(median(totals.baseline)),
      meanDimensions: Object.fromEntries(SCORE_KEYS.map((key) => [key, round(mean(dimensions.baseline[key]))])),
    },
    skill: {
      meanTotal: round(mean(totals.skill)),
      medianTotal: round(median(totals.skill)),
      meanDimensions: Object.fromEntries(SCORE_KEYS.map((key) => [key, round(mean(dimensions.skill[key]))])),
    },
    deltaMeanTotal: round(mean(totals.skill) - mean(totals.baseline)),
    objectiveChecks: checks,
    noHardCheckRegression: noHardRegression,
    allSkillHardChecksPass,
    passedPredeclaredCriterion: testCase.type === "positive" ? positiveSuccess : negativeSuccess,
  };
}

function summarize(cases, runs) {
  const caseSummaries = cases.map((testCase) => summarizeCase(testCase, runs[testCase.id]));
  const positive = caseSummaries.filter((item) => item.type === "positive");
  const negative = caseSummaries.filter((item) => item.type === "negative_control");
  const allVotes = caseSummaries.reduce(
    (acc, item) => ({
      baseline: acc.baseline + item.votes.baseline,
      skill: acc.skill + item.votes.skill,
      tie: acc.tie + item.votes.tie,
    }),
    { baseline: 0, skill: 0, tie: 0 },
  );

  return {
    cases: caseSummaries,
    overall: {
      preferenceVotes: allVotes,
      positiveCasesPassed: positive.filter((item) => item.passedPredeclaredCriterion).length,
      positiveCasesTotal: positive.length,
      negativeControlsPassed: negative.filter((item) => item.passedPredeclaredCriterion).length,
      negativeControlsTotal: negative.length,
      meanScoreDelta: round(mean(caseSummaries.map((item) => item.deltaMeanTotal))),
      passedPredeclaredSuiteCriterion: caseSummaries.every((item) => item.passedPredeclaredCriterion),
    },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const runnerText = await readFile(fileURLToPath(import.meta.url), "utf8");
  const casesText = await readFile(options.cases, "utf8");
  const skillText = await readFile(options.skill, "utf8");
  const suite = JSON.parse(casesText);
  if (options.judges !== suite.protocol.judgeCountPerPair) {
    throw new Error(
      `Frozen protocol requires ${suite.protocol.judgeCountPerPair} judges per pair; received ${options.judges}`,
    );
  }
  const cases = suite.cases.map((testCase, index) => ({ ...testCase, index }));
  const retryLog = [];
  const temp = await prepareIsolatedEnvironment();
  let client;

  try {
    const runtimeSkillDir = join(temp.skillInputRoot, "addictive-writing");
    await mkdir(runtimeSkillDir, { recursive: true });
    options.runtimeSkill = join(runtimeSkillDir, "SKILL.md");
    await writeFile(options.runtimeSkill, skillText, { encoding: "utf8", mode: 0o444 });
    const started = await startClient(options, temp.cleanHome, temp.cleanWorkspace);
    client = started.client;
    const modelList = await client.request("model/list", { limit: 100, includeHidden: true });
    const modelInfo = modelList.data.find((item) => item.id === options.model);
    if (!modelInfo) throw new Error(`Model not found in app-server catalog: ${options.model}`);
    const supported = modelInfo.supportedReasoningEfforts.some((item) => item.reasoningEffort === options.effort);
    if (!supported) throw new Error(`${options.model} does not advertise reasoning effort ${options.effort}`);

    const runs = {};
    for (const testCase of cases) {
      const generationOrder = testCase.index % 2 === 0
        ? ["baseline", "skill"]
        : ["skill", "baseline"];
      const generation = {};
      for (const condition of generationOrder) {
        process.stderr.write(`[generate] ${testCase.id}: ${condition}\n`);
        generation[condition] = await generateCondition(
          client,
          options,
          temp.cleanWorkspace,
          testCase,
          condition,
          retryLog,
        );
      }
      runs[testCase.id] = { generation, generationOrder, judges: [] };
    }

    for (const testCase of cases) {
      for (let judgeIndex = 0; judgeIndex < options.judges; judgeIndex += 1) {
        process.stderr.write(`[judge] ${testCase.id}: ${judgeIndex + 1}/${options.judges}\n`);
        const judge = await judgePair(
          client,
          options,
          temp.cleanWorkspace,
          testCase,
          runs[testCase.id].generation,
          judgeIndex,
          retryLog,
        );
        runs[testCase.id].judges.push(judge);
      }
    }

    const result = {
      schemaVersion: 1,
      runId: `eval-${startedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${sha256(skillText + casesText).slice(0, 8)}`,
      startedAt,
      completedAt: new Date().toISOString(),
      protocol: suite.protocol,
      environment: {
        codexVersion: execFileSync("codex", ["--version"], { encoding: "utf8" }).trim(),
        appServerUserAgent: started.initialized.userAgent,
        nodeVersion: process.version,
        platform: platform(),
        isolation: "Fresh temporary HOME and CODEX_HOME containing only a symlink to file-based auth; empty temporary cwd; minimal environment; read-only threads; shell/apps/web disabled; turns rejected on tool items or model reroutes.",
      },
      requestedConfiguration: { model: options.model, effort: options.effort },
      verifiedCatalogEntry: {
        id: modelInfo.id,
        displayName: modelInfo.displayName,
        description: modelInfo.description,
        supportedReasoningEfforts: modelInfo.supportedReasoningEfforts.map((item) => item.reasoningEffort),
      },
      frozenInputs: {
        skillSha256: sha256(skillText),
        casesSha256: sha256(casesText),
        runnerSha256: sha256(runnerText),
        caseCount: cases.length,
        judgesPerPair: options.judges,
      },
      cases: Object.fromEntries(cases.map((testCase) => [testCase.id, {
        title: testCase.title,
        type: testCase.type,
        task: testCase.task,
        materials: testCase.materials,
        objectiveChecks: testCase.objectiveChecks,
        promptHash: runs[testCase.id].generation.baseline.promptHash,
        generationOrder: runs[testCase.id].generationOrder,
        generation: runs[testCase.id].generation,
        judges: runs[testCase.id].judges,
      }])),
      summary: summarize(cases, runs),
      technicalRetries: retryLog,
      limitations: [
        "This is a frozen four-case paired evaluation with one generated sample per condition, not a statistically powered benchmark.",
        "Blind judges use the same model family as the generators. Separate threads prevent context leakage but do not create external or human independence.",
        "Model outputs can vary across runs even when prompts and configuration are unchanged.",
        "The cases are representative synthetic tasks, not evidence of downstream reader behavior or business outcomes.",
        "Scores and preferences are model judgments; objective check evidence is published so readers can audit it.",
      ],
    };

    const serialized = `${JSON.stringify(result, null, 2)}\n`;
    if (options.out) {
      await mkdir(dirname(options.out), { recursive: true });
      await writeFile(options.out, serialized, "utf8");
      process.stderr.write(`[done] wrote ${options.out}\n`);
    } else {
      process.stdout.write(serialized);
    }
  } finally {
    if (client) await client.close();
    if (!options.keepTemp) {
      await rm(temp.cleanHome, { recursive: true, force: true });
      await rm(temp.cleanWorkspace, { recursive: true, force: true });
      await rm(temp.skillInputRoot, { recursive: true, force: true });
    } else {
      process.stderr.write(`[debug] kept ${temp.cleanHome}, ${temp.cleanWorkspace}, and ${temp.skillInputRoot}\n`);
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
