import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const resultSource = new URL("../../comparison/results.json", import.meta.url);
const corpusSource = new URL("../../comparison/corpus.json", import.meta.url);
const runnerSource = new URL("../../comparison/run-pairs.mjs", import.meta.url);
const skillSource = new URL("../../SKILL.md", import.meta.url);
const destination = new URL("../public/results.json", import.meta.url);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

let resultText;
let corpusText;
let runnerText;
let skillText;
try {
  [resultText, corpusText, runnerText, skillText] = await Promise.all([
    readFile(resultSource, "utf8"),
    readFile(corpusSource, "utf8"),
    readFile(runnerSource, "utf8"),
    readFile(skillSource, "utf8"),
  ]);
} catch (error) {
  console.error("Could not read the canonical comparison artifacts.");
  throw error;
}

const results = JSON.parse(resultText);
const corpus = JSON.parse(corpusText);
if (results.status !== "complete" || results.schemaVersion !== 2) {
  throw new Error("comparison/results.json must be a complete schema-v2 run");
}
if (corpus.schemaVersion !== 2 || corpus.cases?.length !== 24 || results.cases?.length !== 24) {
  throw new Error("The review app requires the balanced 24-case schema-v2 corpus and results");
}

const expectedModeCounts = { create: 12, rewrite: 6, review: 3, outline: 3 };
const actualModeCounts = Object.fromEntries(
  Object.keys(expectedModeCounts).map((mode) => [
    mode,
    results.cases.filter((item) => item.taskMode === mode).length,
  ]),
);
if (JSON.stringify(actualModeCounts) !== JSON.stringify(expectedModeCounts)) {
  throw new Error(`Unexpected task-mode counts: ${JSON.stringify(actualModeCounts)}`);
}

const metadataKeys = [
  "id",
  "taskMode",
  "sizeTier",
  "category",
  "title",
  "prompt",
  "outputConstraint",
  "startsFromDraft",
];
for (let index = 0; index < corpus.cases.length; index += 1) {
  const expected = corpus.cases[index];
  const actual = results.cases[index];
  for (const key of metadataKeys) {
    if (actual?.[key] !== expected[key]) throw new Error(`Case ${index + 1} differs at ${key}`);
  }
  if (JSON.stringify(actual.targetWordRange) !== JSON.stringify(expected.targetWordRange)) {
    throw new Error(`Case ${index + 1} differs at targetWordRange`);
  }
  if (!actual.withoutSkill?.output || !actual.withSkill?.output) {
    throw new Error(`Case ${actual.id} is missing a comparison output`);
  }
}

const artifactHashes = {
  corpusSha256: sha256(corpusText),
  runnerSha256: sha256(runnerText),
  skillSha256: sha256(skillText),
};
for (const [key, value] of Object.entries(artifactHashes)) {
  if (results.hashes?.[key] !== value) throw new Error(`Result ${key} does not match the canonical file`);
}

await mkdir(dirname(fileURLToPath(destination)), { recursive: true });
await copyFile(resultSource, destination);
console.log(`Synced complete ${results.cases.length}-case run ${results.runId} to public/results.json`);
