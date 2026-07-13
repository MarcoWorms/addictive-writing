# Changelog

All notable changes to Addictive Writing are documented here.

## [1.0.2] - 2026-07-12

### Changed

- Replaced the rewrite-heavy corpus with a balanced 24-case suite: 12 create-from-scratch, 6 rewrite, 3 review, and 3 outline tasks.
- Added 48 fresh raw outputs across five target-size tiers and 24 categories.
- Added a private blind-review web workspace with stable A/B assignments, filters, local progress, notes, treatment reveal, keyboard navigation, and JSON/CSV export.
- Kept the Markdown table as an archival fallback instead of the primary review surface.
- Hardened app-server isolation with shared no-tool instructions, explicit capability disables, disallowed-item aborts, and atomic per-pair checkpoints.
- Scoped saved reviews to the exact run and made the app reject stale, incomplete, or hash-mismatched result artifacts.

## [1.0.1] - 2026-07-12

### Changed

- Fully removed the model-judged evaluation, scores, rubrics, rankings, reports, and selected win claims.
- Replaced that method with a manual side-by-side comparison of raw outputs.
- Added 20 fully synthetic tasks spanning five source-size tiers and 20 writing categories.
- Kept the visible user prompt byte-identical across conditions; the skill condition differs only by a separate skill input.
- Added blank preference and notes columns so readers can make their own judgments.
- Added a dependency-free app-server runner and complete reproduction instructions for `gpt-5.6-sol` at `ultra`.

## [1.0.0] - 2026-07-12

### Added

- Initial public release of the Addictive Writing Agent Skill.
- Draft, rewrite, review, outline, and punch-up workflows.
- Guidance for stakes, causal momentum, prediction, earned turns, payoffs, re-hooks, transitions, rhythm, and endings.
- Truthfulness and safety constraints that protect facts, uncertainty, qualifications, intent, and voice.
- Apache-2.0 license and Claude.ai-compatible release archive.

[1.0.2]: https://github.com/MarcoWorms/addictive-writing/releases/tag/v1.0.2
[1.0.1]: https://github.com/MarcoWorms/addictive-writing/releases/tag/v1.0.1
[1.0.0]: https://github.com/MarcoWorms/addictive-writing/releases/tag/v1.0.0
