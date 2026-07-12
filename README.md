# Addictive Writing

[![skills.sh](https://skills.sh/b/marcoworms/addictive-writing)](https://skills.sh/marcoworms/addictive-writing)

**Earned-attention storytelling for AI agents—without clickbait, deception, or factual distortion.**

Addictive Writing is an open Agent Skill for drafting, rewriting, outlining, punching up, and reviewing prose and scripts. It focuses on clear stakes, causal momentum, meaningful questions, earned turns, payoffs, re-hooks, rhythm, and conversational tone while protecting facts, qualifications, intent, and voice.

```bash
npx skills add MarcoWorms/addictive-writing
```

## Judge the real outputs yourself

The repository contains a [20-case side-by-side comparison](comparison/TABLE.md) generated through Codex app-server with `gpt-5.6-sol` at `ultra` reasoning effort.

The cases range from 29-word source snippets to 1,227-word source documents and span grammar, microfiction, product copy, social posts, email, video, technical updates, event copy, explainers, case studies, newsletters, speeches, executive memos, long-form articles, documentary scripts, fiction, keynote writing, personal essays, and policy writing.

Every row exposes:

- the exact user prompt;
- the raw output from a fresh thread without the skill;
- the raw output from a fresh thread with the skill;
- blank fields for your own pick and notes.

There is no model judge, score, winner, or editorial selection. The visible prompt is byte-identical in both conditions; the only treatment difference is the separate `addictive-writing` skill input. [Open the full comparison table →](comparison/TABLE.md)

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

The dependency-free runner starts a fresh isolated thread for every output, alternates condition order by case, disables shell/apps/web, rejects model rerouting or tool use, and performs no retries:

```bash
node comparison/run-pairs.mjs \
  --model gpt-5.6-sol \
  --effort ultra \
  --out comparison/results.json

node comparison/render-table.mjs \
  --input comparison/results.json \
  --output comparison/TABLE.md
```

See the [comparison method](comparison/README.md), [frozen corpus](comparison/corpus.json), and [machine-readable results](comparison/results.json). This is one unjudged output pair per task, not a statistical performance estimate.

## Safety and transparency

The installable `SKILL.md` is instruction-only. It executes no scripts, has no dependencies or embedded credentials, and requires no network access.

The optional comparison runner executes only when explicitly invoked. It requires an existing local Codex login and starts isolated, read-only app-server threads.

The skill instructs agents not to invent facts, evidence, quotations, urgency, scarcity, or stakes, and not to remove qualifications for dramatic effect. “Addictive” means earned reader attention—not deceptive or exploitative manipulation.

## Claude.ai

Download `addictive-writing.zip` from the [latest GitHub release](https://github.com/MarcoWorms/addictive-writing/releases/latest) and upload it as a custom skill.

## License

[Apache-2.0](LICENSE)
