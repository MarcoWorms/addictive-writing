#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
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
const ALLOWED_ITEM_TYPES = new Set([
  "userMessage",
  "agentMessage",
  "reasoning",
  "plan",
  "contextCompaction",
  "skill",
]);
const SIZE_RANGES = {
  tiny: [1, 60],
  short: [61, 180],
  medium: [181, 450],
  large: [451, 850],
  very_large: [851, 1600],
};

function parseArgs(argv) {
  const options = {
    model: "gpt-5.6-sol",
    effort: "ultra",
    corpus: join(HERE, "corpus.json"),
    skill: join(ROOT, "SKILL.md"),
    out: null,
    only: null,
    keepTemp: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--model") options.model = argv[++i];
    else if (arg === "--effort") options.effort = argv[++i];
    else if (arg === "--corpus") options.corpus = resolve(argv[++i]);
    else if (arg === "--skill") options.skill = resolve(argv[++i]);
    else if (arg === "--out") options.out = resolve(argv[++i]);
    else if (arg === "--only") options.only = argv[++i];
    else if (arg === "--keep-temp") options.keepTemp = true;
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        "Usage: node comparison/run-pairs.mjs [options]\n\n" +
        "  --model <id>       Model id (default: gpt-5.6-sol)\n" +
        "  --effort <level>   Reasoning effort (default: ultra)\n" +
        "  --corpus <path>    Frozen comparison corpus\n" +
        "  --skill <path>     SKILL.md used only in the skill condition\n" +
        "  --out <path>       Write result JSON to this path\n" +
        "  --only <case-id>   Run one case from the frozen corpus\n" +
        "  --keep-temp        Keep isolated temporary directories\n",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!options.out) throw new Error("--out is required");
  return options;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function countWords(value) {
  const matches = value.trim().match(/\b[\p{L}\p{N}][\p{L}\p{N}'’.-]*\b/gu);
  return matches ? matches.length : 0;
}

function publicThreadRef(threadId) {
  return `thread-${sha256(threadId).slice(0, 12)}`;
}

function validateCorpus(corpus) {
  if (!Array.isArray(corpus.cases) || corpus.cases.length < 12) {
    throw new Error("Corpus must contain at least 12 cases");
  }
  const ids = new Set();
  for (const testCase of corpus.cases) {
    if (!testCase.id || ids.has(testCase.id)) throw new Error(`Missing or duplicate case id: ${testCase.id}`);
    ids.add(testCase.id);
    if (!SIZE_RANGES[testCase.sizeTier]) throw new Error(`Unknown size tier for ${testCase.id}`);
    if (!testCase.category || !testCase.title || !testCase.prompt) {
      throw new Error(`Incomplete metadata for ${testCase.id}`);
    }
    const [minimum, maximum] = SIZE_RANGES[testCase.sizeTier];
    if (!Number.isInteger(testCase.sourceWordCount)
      || testCase.sourceWordCount < minimum
      || testCase.sourceWordCount > maximum) {
      throw new Error(
        `${testCase.id} declares ${testCase.sourceWordCount} source words outside ${testCase.sizeTier} range ${minimum}-${maximum}`,
      );
    }
  }
}

class AppServerClient extends EventEmitter {
  constructor(child) {
    super();
    this.child = child;
    this.nextId = 1;
    this.pending = new Map();
    this.turns = new Map();
    this.deadError = null;

    const stdout = createInterface({ input: child.stdout });
    stdout.on("line", (line) => this.onLine(line));

    const stderr = createInterface({ input: child.stderr });
    stderr.on("line", () => {});

    const fail = (error) => {
      if (this.deadError) return;
      this.deadError = error;
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(error);
      }
      this.pending.clear();
      for (const state of this.turns.values()) {
        for (const waiter of state.waiters ?? []) {
          clearTimeout(waiter.timer);
          waiter.reject(error);
        }
        state.waiters = [];
      }
    };

    child.on("exit", (code, signal) => {
      fail(new Error(`codex app-server exited (code=${code}, signal=${signal})`));
    });
    child.on("error", fail);
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

    if (!message.method) return;
    this.handleNotification(message);
    if (message.id !== undefined) {
      this.send({
        id: message.id,
        error: { code: -32601, message: `Unsupported server request: ${message.method}` },
      });
    }
  }

  handleNotification(message) {
    const params = message.params ?? {};
    const turnId = params.turnId ?? params.turn?.id;
    if (!turnId) return;
    const state = this.turns.get(turnId) ?? {
      messages: [],
      userTexts: [],
      itemTypes: new Set(),
      reroutes: [],
      completed: false,
      status: null,
      error: null,
      waiters: [],
    };

    if ((message.method === "item/started" || message.method === "item/completed") && params.item?.type) {
      state.itemTypes.add(params.item.type);
    }
    if (message.method === "item/completed" && params.item?.type === "userMessage") {
      const visibleText = (params.item.content ?? [])
        .filter((item) => item.type === "text")
        .map((item) => item.text)
        .join("\n");
      state.userTexts.push(visibleText);
    }
    if (message.method === "item/completed" && params.item?.type === "agentMessage") {
      state.messages.push({ phase: params.item.phase ?? null, text: params.item.text ?? "" });
    }
    if (message.method === "model/rerouted") {
      state.reroutes.push({
        fromModel: params.fromModel ?? null,
        toModel: params.toModel ?? null,
        reason: params.reason ?? null,
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
    this.turns.set(turnId, state);
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

  async waitForTurn(turnId, timeoutMs = 900_000) {
    const existing = this.turns.get(turnId);
    if (!existing?.completed) {
      await new Promise((resolveWaiter, rejectWaiter) => {
        const timer = setTimeout(() => rejectWaiter(new Error(`Turn timeout: ${turnId}`)), timeoutMs);
        const state = this.turns.get(turnId) ?? {
          messages: [],
          userTexts: [],
          itemTypes: new Set(),
          reroutes: [],
          completed: false,
          status: null,
          error: null,
          waiters: [],
        };
        state.waiters.push({ resolve: resolveWaiter, reject: rejectWaiter, timer });
        this.turns.set(turnId, state);
      });
    }

    const state = this.turns.get(turnId);
    if (state?.status !== "completed") {
      throw new Error(`Turn ${turnId} ended with status ${state?.status}: ${JSON.stringify(state?.error)}`);
    }
    const final = [...state.messages].reverse().find((item) => item.phase === "final_answer")
      ?? [...state.messages].reverse()[0];
    if (!final?.text) throw new Error(`Turn ${turnId} completed without a final answer`);
    return {
      text: final.text,
      visibleUserText: state.userTexts.at(-1) ?? null,
      itemTypes: [...state.itemTypes].sort(),
      reroutes: state.reroutes,
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

async function prepareEnvironment(skillText) {
  const cleanHome = await mkdtemp(join(tmpdir(), "addictive-writing-pairs-home-"));
  const cleanWorkspace = await mkdtemp(join(tmpdir(), "addictive-writing-pairs-workspace-"));
  const skillRoot = await mkdtemp(join(tmpdir(), "addictive-writing-pairs-skill-"));
  const sourceHome = process.env.CODEX_HOME || join(homedir(), ".codex");
  const sourceAuth = join(sourceHome, "auth.json");

  try {
    await access(sourceAuth);
    await symlink(sourceAuth, join(cleanHome, "auth.json"));
    const runtimeSkillDir = join(skillRoot, "addictive-writing");
    await mkdir(runtimeSkillDir, { recursive: true });
    const runtimeSkill = join(runtimeSkillDir, "SKILL.md");
    await writeFile(runtimeSkill, skillText, { encoding: "utf8", mode: 0o444 });
    return { cleanHome, cleanWorkspace, skillRoot, runtimeSkill };
  } catch (error) {
    await rm(cleanHome, { recursive: true, force: true });
    await rm(cleanWorkspace, { recursive: true, force: true });
    await rm(skillRoot, { recursive: true, force: true });
    throw error;
  }
}

async function startClient(options, environment) {
  const childEnv = {
    PATH: process.env.PATH,
    HOME: environment.cleanHome,
    CODEX_HOME: environment.cleanHome,
    TMPDIR: process.env.TMPDIR || tmpdir(),
    SHELL: process.env.SHELL || "/bin/sh",
    LANG: process.env.LANG || "C.UTF-8",
    USER: process.env.USER || "comparison",
    LOGNAME: process.env.LOGNAME || process.env.USER || "comparison",
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
      cwd: environment.cleanWorkspace,
      env: childEnv,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  const client = new AppServerClient(child);
  try {
    const initialized = await client.request("initialize", {
      clientInfo: {
        name: "addictive_writing_manual_pairs",
        title: "Addictive Writing Manual Comparison",
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

async function startThread(client, options, environment) {
  const result = await client.request("thread/start", {
    model: options.model,
    cwd: environment.cleanWorkspace,
    approvalPolicy: "never",
    sandbox: "read-only",
    serviceName: "addictive-writing-manual-comparison",
  });
  if (result.model !== options.model) {
    throw new Error(`Thread model mismatch: requested ${options.model}, got ${result.model}`);
  }
  if (result.reasoningEffort !== options.effort) {
    throw new Error(`Thread effort mismatch: requested ${options.effort}, got ${result.reasoningEffort}`);
  }
  return result;
}

async function runCondition(client, options, environment, testCase, condition) {
  const thread = await startThread(client, options, environment);
  const input = condition === "withSkill"
    ? [
        { type: "text", text: testCase.prompt },
        { type: "skill", name: "addictive-writing", path: environment.runtimeSkill },
      ]
    : [{ type: "text", text: testCase.prompt }];
  const started = await client.request("turn/start", {
    threadId: thread.thread.id,
    input,
    model: options.model,
    effort: options.effort,
  });
  const completed = await client.waitForTurn(started.turn.id);

  if (completed.reroutes.length) {
    throw new Error(`Model rerouted in ${testCase.id}/${condition}: ${JSON.stringify(completed.reroutes)}`);
  }
  const disallowed = completed.itemTypes.filter((type) => !ALLOWED_ITEM_TYPES.has(type));
  if (disallowed.length) {
    throw new Error(`Tool or mode item in ${testCase.id}/${condition}: ${disallowed.join(", ")}`);
  }
  if (completed.visibleUserText !== testCase.prompt) {
    throw new Error(`Visible prompt mismatch in ${testCase.id}/${condition}`);
  }

  return {
    threadRef: publicThreadRef(thread.thread.id),
    skillItemSent: condition === "withSkill",
    visiblePromptSha256: sha256(completed.visibleUserText),
    output: completed.text,
    outputWordCount: countWords(completed.text),
    outputCharacterCount: completed.text.length,
    observedItemTypes: completed.itemTypes,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const runnerText = await readFile(fileURLToPath(import.meta.url), "utf8");
  const corpusText = await readFile(options.corpus, "utf8");
  const skillText = await readFile(options.skill, "utf8");
  const corpus = JSON.parse(corpusText);
  validateCorpus(corpus);
  const selectedCases = options.only
    ? corpus.cases.filter((testCase) => testCase.id === options.only)
    : corpus.cases;
  if (!selectedCases.length) throw new Error(`Case not found: ${options.only}`);

  const environment = await prepareEnvironment(skillText);
  let client;
  try {
    const started = await startClient(options, environment);
    client = started.client;
    const modelList = await client.request("model/list", { limit: 100, includeHidden: true });
    const modelInfo = modelList.data.find((item) => item.id === options.model);
    if (!modelInfo) throw new Error(`Model not found in app-server catalog: ${options.model}`);
    if (!modelInfo.supportedReasoningEfforts.some((item) => item.reasoningEffort === options.effort)) {
      throw new Error(`${options.model} does not advertise effort ${options.effort}`);
    }

    const cases = [];
    for (const testCase of selectedCases) {
      const corpusIndex = corpus.cases.findIndex((item) => item.id === testCase.id);
      const conditionOrder = corpusIndex % 2 === 0
        ? ["withoutSkill", "withSkill"]
        : ["withSkill", "withoutSkill"];
      const pair = {};
      for (const condition of conditionOrder) {
        process.stderr.write(`[${cases.length + 1}/${selectedCases.length}] ${testCase.id}: ${condition}\n`);
        pair[condition] = await runCondition(client, options, environment, testCase, condition);
      }
      if (pair.withoutSkill.visiblePromptSha256 !== pair.withSkill.visiblePromptSha256) {
        throw new Error(`Prompt hash mismatch between conditions for ${testCase.id}`);
      }
      cases.push({
        ...testCase,
        promptSha256: sha256(testCase.prompt),
        promptWordCount: countWords(testCase.prompt),
        conditionOrder,
        withoutSkill: pair.withoutSkill,
        withSkill: pair.withSkill,
      });
    }

    const result = {
      schemaVersion: 1,
      method: "raw-side-by-side-manual-comparison",
      runId: `pairs-${startedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${sha256(skillText + corpusText).slice(0, 8)}`,
      startedAt,
      completedAt: new Date().toISOString(),
      configuration: {
        requestedModel: options.model,
        requestedEffort: options.effort,
        verifiedModel: modelInfo.id,
        verifiedDisplayName: modelInfo.displayName,
        codexVersion: execFileSync("codex", ["--version"], { encoding: "utf8" }).trim(),
        appServerUserAgent: started.initialized.userAgent,
        nodeVersion: process.version,
        platform: platform(),
      },
      controls: {
        visiblePrompt: "byte-identical between conditions",
        withoutSkill: "text input only",
        withSkill: "same text input plus one explicit skill input item",
        addedSkillMarkerInText: false,
        freshThreadPerOutput: true,
        conditionOrder: "alternated by case",
        retries: 0,
        judgmentsOrScores: false,
        shellAppsAndWeb: "disabled",
        modelReroute: "abort",
      },
      hashes: {
        skillSha256: sha256(skillText),
        corpusSha256: sha256(corpusText),
        runnerSha256: sha256(runnerText),
      },
      cases,
    };

    await mkdir(dirname(options.out), { recursive: true });
    await writeFile(options.out, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    process.stderr.write(`[done] wrote ${options.out}\n`);
  } finally {
    if (client) await client.close();
    if (!options.keepTemp) {
      await rm(environment.cleanHome, { recursive: true, force: true });
      await rm(environment.cleanWorkspace, { recursive: true, force: true });
      await rm(environment.skillRoot, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
