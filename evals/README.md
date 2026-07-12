# Reproducing the evaluation

This directory contains two frozen four-case paired evaluations of Addictive Writing. Each compares a strong task-specific prompt against the identical prompt plus an explicit `addictive-writing` skill input.

The protocol uses Codex app-server with `gpt-5.6-sol` at `ultra`, one generated sample per condition, and four blind separate-thread model judgments per pair. Every generator and judge runs in a fresh thread. The app-server process gets an empty temporary workspace, isolated `HOME` and `CODEX_HOME` directories containing only a symlink to the existing Codex authentication file, and a minimal environment. The runner fails a turn if it detects tool use or a model reroute.

## Run it

Requirements:

- Node.js 18 or newer
- A `codex` CLI with app-server support; the published runs used `codex-cli 0.144.0-alpha.4`
- An existing file-based Codex login at `${CODEX_HOME:-$HOME/.codex}/auth.json` (`codex login status`)
- Access to `gpt-5.6-sol` and the `ultra` reasoning effort

Run the final holdout from the repository root:

```bash
node evals/run-eval.mjs \
  --model gpt-5.6-sol \
  --effort ultra \
  --judges 4 \
  --out evals/results/local-run.json
```

Reproduce the earlier development result with the exact frozen skill version it tested:

```bash
node evals/run-eval.mjs \
  --model gpt-5.6-sol \
  --effort ultra \
  --judges 4 \
  --cases evals/suites/development-v1.json \
  --skill evals/fixtures/SKILL-development-v1.md \
  --out evals/results/local-development-run.json
```

The runner checks the live app-server model catalog before generating anything. It records the model and effort returned by the server, Codex and Node versions, hashes of the runner, frozen skill, and cases, pseudonymous thread references, final outputs, word counts, deterministic checks, blind A/B mappings, structured judgments, sanitized technical retries, and limitations. It does not publish private reasoning traces, tokens, account identifiers, or source authentication data.

One fresh-thread retry is allowed for a transport, service, or invalid structured-output failure and is always published in `technicalRetries`. A detected tool use or model reroute aborts the run instead of resampling that condition.

Published artifacts:

- [Evaluation report](REPORT.md)
- [Development result](results/development-v1.json)
- [Holdout result](results/holdout-v1.json)

App-server schemas can change between Codex versions. The runner verifies the live catalog and exact thread configuration, but a future CLI may require a version-specific adjustment.

## Frozen design

The [development suite](suites/development-v1.json) covered a factual script rewrite, review-only diagnosis, a qualified research summary, and a grammar control. It exposed two evidence-calibration regressions in the skill and did **not** pass its predeclared suite criterion. Those failures informed four narrow, general truth-calibration edits preserved by the [development skill fixture](fixtures/SKILL-development-v1.md).

The revised skill was then frozen before any output from the new [holdout suite](suites/holdout-v1.json) was generated. The holdout covers:

1. an engineering incident case-study opening;
2. a fiction scene with an earned reveal;
3. an evidence-bound executive memo review; and
4. a grammar-only negative control where extra storytelling is a failure.

The positive-case success criterion was frozen before generation: the skill must receive more blind preference votes, pass every hard factual and task constraint, and not regress on any hard check. The negative control must fix every seeded grammar error without unauthorized changes or material regression.

Judges score task fulfillment, factual fidelity, attention and structure, prose quality, constraint compliance, and voice preservation from 0–10. They also evaluate task-specific checks before choosing A, B, or a tie. Four judges allow A/B order to be balanced within every case. Word limits and the grammar-only control also receive deterministic checks outside the model judgments.

## What this can and cannot show

This is a reproducible controlled demonstration, not a statistically powered benchmark or proof of real-world reader behavior. Fresh threads isolate conversational context, but the blind judges use the same model family as the generators and therefore do not provide human or cross-model independence. One sample per condition is vulnerable to generation variance. Repeat runs and human evaluation would strengthen the evidence.

The Codex app-server protocol and explicit skill input used by the runner are documented in the [Codex App Server reference](https://learn.chatgpt.com/docs/app-server).
