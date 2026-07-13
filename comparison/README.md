# Balanced manual comparison

This comparison intentionally does not score writing quality. It publishes one raw output pair for each of 24 fully synthetic tasks across four workflows:

- 12 create-from-scratch tasks built from briefs, facts, or fictional premises with no prose draft;
- 6 rewrite tasks;
- 3 editorial review tasks;
- 3 outline tasks.

The requested outputs span five tiers from 35-word ads to 1,400-word fiction. Every case has its own category.

## Review the outputs

Use the [blind review workspace](https://addictive-writing-review.marcogworms.chatgpt.site). It shows one case at a time, keeps A/B treatment labels hidden until you reveal them, saves review data in your browser, and exports your choices and notes as JSON or CSV.

[`TABLE.md`](TABLE.md) is a raw archival fallback, not the recommended review interface.

## Generation method

For every case, the runner:

1. starts a fresh isolated Codex app-server thread without the skill;
2. sends the exact user prompt;
3. starts another fresh thread with the skill;
4. sends the byte-identical user prompt plus a separate `skill` input item;
5. records both final answers without judging, ranking, editing, or repairing them.

Both conditions receive the same shared developer instruction prohibiting tools, delegation, browsing, file inspection, and plans. Shell, apps, web, multi-agent, browser, computer-use, image generation, goals, and workspace helpers are explicitly disabled. A tool item, prompt mismatch, failed turn, or model reroute aborts the run. Condition order alternates by case. Accepted pairs are atomically checkpointed. There are no retries.

The canonical run completed 24 pairs in 48 unique fresh threads. Thirteen outputs missed their requested word range; those misses remain raw and are flagged in the reviewer instead of being corrected or hidden.

## Reproduce

Requirements:

- Node.js 18 or newer
- Codex CLI with app-server support
- File-based Codex login at `${CODEX_HOME:-$HOME/.codex}/auth.json`
- Access to `gpt-5.6-sol` and `ultra`

From the repository root:

```bash
node comparison/run-pairs.mjs \
  --model gpt-5.6-sol \
  --effort ultra \
  --out comparison/results.json

node comparison/render-table.mjs \
  --input comparison/results.json \
  --output comparison/TABLE.md
```

To smoke-test one case before a complete run, add `--only <case-id>`. The canonical `results.json` was produced by the complete command without that option.

Run the reviewer locally:

```bash
cd review-app
npm install
npm run dev
```

The app build fails closed if the result is incomplete, stale, not schema v2, not the expected 24 cases, or does not match the corpus, runner, and skill hashes.

## Interpretation boundary

This is one concrete, unjudged output pair per task—not a statistical performance estimate. Model generation is nondeterministic, and a reproduction may differ in wording. Treat the prompt hashes, isolation controls, and unedited outputs as an auditable comparison, not proof that either condition will always be better.
