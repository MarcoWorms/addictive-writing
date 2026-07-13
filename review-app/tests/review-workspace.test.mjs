import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { csvCell } from "../app/csv-utils.mjs";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the blind review product shell without starter metadata", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Blind Copy Review — Addictive Writing<\/title>/i);
  assert.match(html, /Preparing your review workspace/);
  assert.match(html, /Your private draft stays in this browser/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("ships review data and the complete evaluation controls", async () => {
  const [resultsSource, resultsPublic, workspace] = await Promise.all([
    readFile(new URL("../../comparison/results.json", import.meta.url), "utf8"),
    readFile(new URL("../public/results.json", import.meta.url), "utf8"),
    readFile(new URL("../app/ReviewWorkspace.tsx", import.meta.url), "utf8"),
  ]);
  assert.deepEqual(JSON.parse(resultsPublic), JSON.parse(resultsSource));
  const results = JSON.parse(resultsPublic);
  assert.equal(results.status, "complete");
  assert.equal(results.schemaVersion, 2);
  assert.equal(results.cases.length, 24);
  assert.deepEqual(
    Object.fromEntries(
      ["create", "rewrite", "review", "outline"].map((mode) => [
        mode,
        results.cases.filter((item) => item.taskMode === mode).length,
      ]),
    ),
    { create: 12, rewrite: 6, review: 3, outline: 3 },
  );
  assert.ok(results.cases.every((item) => item.prompt && item.withoutSkill?.output && item.withSkill?.output));
  assert.ok(results.cases.every((item) => Array.isArray(item.targetWordRange) && item.targetWordRange.length === 2));
  assert.equal(results.controls.judgmentsOrScores, false);
  assert.equal(results.controls.retries, 0);

  for (const capability of [
    "localStorage",
    "assignment(reviewerId",
    "Reveal treatments",
    "Review as JSON",
    "Review as CSV",
    "Keyboard shortcuts",
    "Autosaves locally",
    "Reset everything",
    "STORAGE_KEY_PREFIX",
    "targetWordRange",
    "role=\"progressbar\"",
    "aria-labelledby=\"reset-dialog-title\"",
  ]) {
    assert.match(workspace, new RegExp(capability.replace(/[()]/g, "\\$&")));
  }
});

test("neutralizes spreadsheet formulas in exported CSV cells", () => {
  assert.equal(csvCell("plain note"), '"plain note"');
  assert.equal(csvCell('a "quote"'), '"a ""quote"""');
  for (const dangerous of ["=1+1", "+SUM(A1:A2)", "-2+3", "@cmd", "\t=HYPERLINK(\"x\")", "\r=1", "\n=1", "   =1"]) {
    assert.ok(csvCell(dangerous).startsWith('"\''), `expected apostrophe prefix for ${JSON.stringify(dangerous)}`);
  }
});
