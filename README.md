# Addictive Writing

[![skills.sh](https://skills.sh/b/marcoworms/addictive-writing)](https://skills.sh/marcoworms/addictive-writing)

**Earned-attention storytelling for AI agents—without clickbait, deception, or factual distortion.**

Addictive Writing is an open Agent Skill for drafting, rewriting, outlining, punching up, and reviewing prose and scripts. It focuses on clear stakes, causal momentum, meaningful questions, earned turns, payoffs, re-hooks, rhythm, and conversational tone while protecting facts, qualifications, intent, and voice.

```bash
npx skills add MarcoWorms/addictive-writing
```

## Real test evidence

On July 12, 2026, the skill was tested through Codex app-server with `gpt-5.6-sol` at `ultra`. Each test compared a strong task-specific prompt against the identical prompt plus the skill. Outputs were blind-labeled, shown in both A/B orders, and judged in four fresh model threads. The runner detected no tool use or model rerouting, and both published runs completed with zero retries.

Two cases produced unanimous skill wins:

| Case | Blind votes | Mean score | Hard checks |
|---|---:|---:|---:|
| Engineering incident opening | Skill 4–0 | 59.0 vs 56.0 / 60 | All passed |
| Short-form factual script | Skill 4–0 | 57.75 vs 55.75 / 60 | All passed |

Both grammar-only controls were exact ties: the skill made the required corrections and nothing else.

This evidence has a real boundary: neither four-case suite passed its predeclared all-cases criterion. The strong baseline won three review/research cases, and the fiction case split 2–2. These runs support targeted value in the causal rewriting cases—not a claim that the skill universally improves GPT-5.6-Sol at `ultra`. See the [full evaluation report](evals/REPORT.md) and [raw results](evals/results/holdout-v1.json).

### Example 1: engineering causality without invented impact

The skill condition won 4–0 while using 135 words versus the baseline’s 162.

**Strong baseline excerpt**

> The incident therefore presented two kinds of evidence: performance and error-rate changes that coincided with the deployment and rollback, and a specific checkout failure mechanism verified through logs and reproduction.

**With Addictive Writing**

> The post-rollback movement was consistent with the deployment timeline; the expired-token behavior was the part confirmed directly by evidence. We have no estimate of customer, revenue, or other business impact.

[Read the complete prompt, outputs, and result](examples/prose-before-after.md).

### Example 2: a stronger spoken hook with the caveat intact

The skill condition won 4–0 and passed every factual check.

**Strong baseline opening**

> What happened when our team made a signup form much shorter? We reduced it from nine fields to three, then compared the two versions in a 14-day A/B test.

**With Addictive Writing**

> We cut our signup form from nine fields to three—and the result wasn’t what you might expect.

The finished script still said the interviews only suggested an explanation, did not establish causation, and that restoring two fields recovered most—but not all—of the measured loss.

[Read the complete prompt, outputs, and result](examples/script-before-after.md).

## Complete test outcomes

| Suite | Case | Skill votes | Baseline votes | Ties | Mean score delta / 60 | Criterion |
|---|---|---:|---:|---:|---:|---:|
| Development | Short-form script | 4 | 0 | 0 | +2.0 | Pass |
| Development | Review without rewriting | 0 | 3 | 1 | −2.0 | Fail |
| Development | Qualified newsletter | 0 | 4 | 0 | −1.5 | Fail |
| Development | Grammar control | 0 | 0 | 4 | 0.0 | Pass |
| Holdout | Engineering incident | 4 | 0 | 0 | +3.0 | Pass |
| Holdout | Fiction reveal | 2 | 2 | 0 | +0.5 | Fail |
| Holdout | Evidence memo review | 0 | 4 | 0 | −4.0 | Fail |
| Holdout | Grammar control | 0 | 0 | 4 | 0.0 | Pass |

The development failures led to four narrow truth-calibration edits before the holdout was written and frozen. The holdout still failed overall, so the repository preserves both the improvement and the remaining limitation instead of presenting only favorable examples.

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

## Examples

- [Engineering case-study rewrite](examples/prose-before-after.md)
- [Short-form script rewrite](examples/script-before-after.md)
- [Review example and known limitation](examples/review-example.md)

## Reproduce the tests

The repository includes the dependency-free runner, frozen suites, exact development-skill fixture, final outputs, blind mappings, judgments, deterministic checks, and input hashes:

```bash
node evals/run-eval.mjs \
  --model gpt-5.6-sol \
  --effort ultra \
  --judges 4 \
  --out evals/results/local-run.json
```

See [evals/README.md](evals/README.md) for isolation details, the development reproduction command, and limitations.

## Safety and transparency

The installable `SKILL.md` is instruction-only. It executes no scripts, has no dependencies or embedded credentials, and requires no network access.

The repository also contains an optional evaluation runner. It runs only when explicitly invoked, requires an existing local Codex login, and starts isolated read-only app-server threads.

The skill instructs agents not to invent facts, evidence, quotations, urgency, scarcity, or stakes, and not to remove qualifications for dramatic effect. “Addictive” means earned reader attention—not deceptive or exploitative manipulation.

## Claude.ai

Download `addictive-writing.zip` from the [latest GitHub release](https://github.com/MarcoWorms/addictive-writing/releases/latest) and upload it as a custom skill.

## License

[Apache-2.0](LICENSE)
