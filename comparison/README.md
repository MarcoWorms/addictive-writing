# Manual comparison method

This comparison intentionally does not score writing quality. It publishes one raw output pair for each of 20 fully synthetic tasks, ranging from tiny copyedits to long-form fiction, essays, scripts, speeches, and policy writing.

For every case:

1. start a fresh isolated Codex app-server thread without the skill;
2. send the exact user prompt;
3. start another fresh thread with the skill;
4. send the byte-identical user prompt plus a separate `skill` input item;
5. record both final answers without judging, ranking, or editing them.

The condition order alternates by case. Shell, apps, and web access are disabled. A tool item, prompt mismatch, failed turn, or model reroute aborts the run. There are no retries.

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

Open [`TABLE.md`](TABLE.md), expand the prompt and output cells, and record your own preference and notes. The runner makes no quality claim.

To smoke-test one case before a complete run, add `--only <case-id>`. The canonical `results.json` and `TABLE.md` were produced by the complete command above, without that option.

## Interpretation boundary

The table is a set of concrete examples, not a statistical estimate. Model generation is nondeterministic, and a reproduction may differ in wording. Treat the prompt hashes, condition controls, and unedited outputs as an auditable comparison—not as proof that either condition will always be better.
