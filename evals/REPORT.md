# Evaluation report

## Bottom line

Addictive Writing showed two unanimous, constraint-safe wins in causal rewriting tasks, tied both grammar-only controls, split a fiction task, and lost three review/research tasks to an already strong GPT-5.6-Sol baseline. Neither frozen suite passed its predeclared all-cases criterion.

The supported claim is narrow: **in these runs, the skill helped most with causal momentum and evidence-bound narrative openings while avoiding unnecessary changes on simple grammar tasks.** The results do not establish general superiority over GPT-5.6-Sol at `ultra`.

## Method

- Date: July 12, 2026
- Codex CLI: `0.144.0-alpha.4`
- App-server model: `gpt-5.6-sol`
- Reasoning effort: `ultra`
- Conditions: strong task prompt vs identical prompt plus explicit skill input
- Samples: one output per condition per case
- Judging: four fresh blind model threads per pair, balanced 2/2 A/B order
- Isolation: temporary `HOME`, `CODEX_HOME`, skill input, and workspace; minimal environment; read-only threads; shell, apps, and web disabled
- Guardrails: abort on model reroute or tool item; deterministic word and grammar checks; exact structured-check validation
- Technical retries: zero in both published runs

Each positive case required a majority of skill preference votes, every hard check to pass, and no hard-check regression. The negative control required exact corrections without extra rewriting. Each suite required every case to pass.

## Development suite

The [development suite](suites/development-v1.json) tested the skill preserved in [SKILL-development-v1.md](fixtures/SKILL-development-v1.md).

| Case | Votes (skill / baseline / tie) | Mean scores | Delta | Hard checks | Result |
|---|---:|---:|---:|---:|---:|
| Short-form factual script | 4 / 0 / 0 | 57.75 vs 55.75 | +2.0 | All passed | Pass |
| Review without rewriting | 0 / 3 / 1 | 57.75 vs 59.75 | −2.0 | All passed | Fail |
| Qualified newsletter | 0 / 4 / 0 | 57.0 vs 58.5 | −1.5 | All passed | Fail |
| Grammar-only control | 0 / 0 / 4 | 60.0 vs 60.0 | 0.0 | All passed deterministically | Pass |

Suite result: **fail**. Preference votes were skill 4, baseline 7, tie 5. Mean case-level score delta was −0.37 / 60.

The review/research losses exposed four general calibration problems: unbenchmarked evaluative labels, overly absolute limitation language, epistemic strength stronger than the source, and hypothetical truth risks not present in the material. Four narrow rules were revised in `SKILL.md` before the holdout was authored.

[Inspect the complete development outputs and judgments](results/development-v1.json).

## Frozen holdout suite

The revised skill and [holdout suite](suites/holdout-v1.json) were hashed before any holdout generation:

- Skill SHA-256: `a8b9162e85d8cae66eabe687c1ac6f51541df10a95a8216623d70e96c45f5b99`
- Suite SHA-256: `a561d7c095d4121c2ac820d4241510669520de3f916d9ca5eb2c5bc9829b8bc7`
- Runner SHA-256: `9c768f4d8f7ec75993f4517196e8ff5b0a06f7eea4bb81880ad9cbfa9ca76d9d`

| Case | Votes (skill / baseline / tie) | Mean scores | Delta | Hard checks | Result |
|---|---:|---:|---:|---:|---:|
| Engineering incident opening | 4 / 0 / 0 | 59.0 vs 56.0 | +3.0 | All passed | Pass |
| Fiction earned reveal | 2 / 2 / 0 | 56.75 vs 56.25 | +0.5 | All passed | Fail |
| Evidence memo review | 0 / 4 / 0 | 53.5 vs 57.5 | −4.0 | All passed | Fail |
| Grammar-only control | 0 / 0 / 4 | 60.0 vs 60.0 | 0.0 | All passed deterministically | Pass |

Suite result: **fail**. Preference votes were skill 6, baseline 6, tie 4. Mean case-level score delta was −0.12 / 60.

The incident win came from tighter compression, explicit timing, and a more exact boundary between temporal movement and a confirmed failure mechanism. The fiction outputs split: both passed every constraint, with judges disagreeing about which version had the cleaner prediction-to-reveal rhythm. In the memo review, the skill’s proposed literal word substitutions were less mechanically usable than the baseline’s sentence-level fixes.

[Inspect the complete holdout outputs and judgments](results/holdout-v1.json).

## What the evidence supports

- Two different causal rewriting cases produced unanimous 4–0 skill wins.
- Every skill output passed every hard task and factual check by judge majority.
- Both negative controls produced text-identical baseline and skill outputs and passed deterministic checks.
- The skill did not consistently improve review or research-summary work against this model and effort.
- Across both suites, votes were skill 10, baseline 13, tie 9. This does not support an overall superiority claim.

## Limitations

- One sample per condition is vulnerable to generation variance.
- Judges use the same model family as generators; fresh threads isolate context but are not human or cross-model independence.
- The tasks are representative synthetic cases, not measurements of reader retention or business outcomes.
- Model scores are subjective. Raw outputs, mappings, check evidence, and deterministic results are published for audit.
- The development suite informed the revision and is not a holdout. Only the second suite was frozen after that revision.

See the [repository README](../README.md) for exact reproduction commands and the [Codex App Server reference](https://learn.chatgpt.com/docs/app-server) for the protocol.
