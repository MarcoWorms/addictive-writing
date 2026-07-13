# Addictive Writing

[![skills.sh](https://skills.sh/b/marcoworms/addictive-writing)](https://skills.sh/marcoworms/addictive-writing)

**Earned-attention storytelling for AI agents—without clickbait, deception, or factual distortion.**

Addictive Writing is an open Agent Skill for drafting, rewriting, outlining, punching up, and reviewing prose and scripts. It focuses on clear stakes, causal momentum, meaningful questions, earned turns, payoffs, re-hooks, rhythm, and conversational tone while protecting facts, qualifications, intent, and voice.

```bash
npx skills add MarcoWorms/addictive-writing
```

## Review 48 raw outputs yourself

[**Open the blind review workspace →**](https://addictive-writing-review.marcogworms.chatgpt.site)

The balanced suite contains 24 fully synthetic tasks generated through Codex app-server with `gpt-5.6-sol` at `ultra` reasoning effort:

| Workflow | Cases | What it tests |
|---|---:|---|
| Create from scratch | 12 | Original ads, packaging, email, fundraising, landing pages, scripts, sales copy, and fiction from briefs—not drafts |
| Rewrite | 6 | Transforming supplied text from microcopy through long-form B2B copy |
| Review | 3 | Diagnosing conversion copy, a public statement, and a grant narrative without rewriting |
| Outline | 3 | Structuring an audio walk, technical webinar, and serialized mystery |

Targets range from 35-word ads to 1,400-word fiction across 24 categories. The browser workspace presents one case at a time with stable blind A/B labels, prompt and treatment reveal controls, mode/size/category filters, local notes and preferences, keyboard navigation, progress tracking, and JSON/CSV export.

There is no model judge, score, winner, or editorial selection. Every prompt and output is raw, including constraint misses. The visible prompt is byte-identical in both conditions; the skill condition differs only by a separate `addictive-writing` skill input.

Audit the [frozen corpus](comparison/corpus.json), [machine-readable results](comparison/results.json), or [raw Markdown fallback](comparison/TABLE.md).

## What it helps with

- Strengthening hooks without misleading clickbait
- Replacing flat chronology with causal progression
- Building stakes, questions, earned reveals, payoffs, and re-hooks
- Diagnosing pacing and likely reader drop-off
- Improving transitions, rhythm, and conversational tone
- Reviewing prose, essays, newsletters, presentations, and scripts
- Preserving factual boundaries, uncertainty, intent, and authorial voice

## Install options

Install globally:

```bash
npx skills add MarcoWorms/addictive-writing -g
```

Target an agent:

```bash
npx skills add MarcoWorms/addictive-writing -g -a codex
npx skills add MarcoWorms/addictive-writing -g -a claude-code
```

Inspect the repository before installing:

```bash
npx skills add MarcoWorms/addictive-writing --list
```

There is no npm package to publish. The `skills` CLI installs the skill from this GitHub repository.

## Example prompts

> Use addictive-writing to review this article. Identify likely attention leaks, then propose the smallest effective revisions.

> Rewrite this video script for stronger stakes, causal progression, rhythm, and re-hooks. Do not exaggerate any claims.

> Review this chapter for unresolved questions, earned surprises, repetitive rhythm, and weak transitions. Do not rewrite it.

> Correct the grammar in this paragraph without adding narrative structure it does not need.

## Reproduce the comparison

The dependency-free runner starts a fresh isolated thread for every output, alternates condition order by case, disables shell, apps, web, collaboration, browser, computer-use, and other tools, rejects model rerouting or tool items, checkpoints every accepted pair, and performs no retries:

```bash
node comparison/run-pairs.mjs \
  --model gpt-5.6-sol \
  --effort ultra \
  --out comparison/results.json

node comparison/render-table.mjs \
  --input comparison/results.json \
  --output comparison/TABLE.md
```

Launch the same review interface locally:

```bash
cd review-app
npm install
npm run dev
```

See the [comparison method](comparison/README.md), [frozen corpus](comparison/corpus.json), [machine-readable results](comparison/results.json), and [review-app source](review-app). This is one unjudged output pair per task, not a statistical performance estimate.

## Safety and transparency

The installable `SKILL.md` is instruction-only. It executes no scripts, has no dependencies or embedded credentials, and requires no network access.

The optional comparison runner executes only when explicitly invoked. It requires an existing local Codex login and starts isolated, read-only app-server threads.

The skill instructs agents not to invent facts, evidence, quotations, urgency, scarcity, or stakes, and not to remove qualifications for dramatic effect. “Addictive” means earned reader attention—not deceptive or exploitative manipulation.

## Claude.ai

Download `addictive-writing.zip` from the [latest GitHub release](https://github.com/MarcoWorms/addictive-writing/releases/latest) and upload it as a custom skill.

## License

[Apache-2.0](LICENSE)
