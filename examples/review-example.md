# Tested review example: a known limitation

The repository publishes unfavorable results as well as wins. In this holdout case, the skill identified all required evidence problems and passed every hard check, but four blind judges preferred the strong baseline because its proposed fixes were more mechanically usable.

## Task

Review an executive support memo without rewriting it. In 220 words or fewer, provide a reader contract, exactly three prioritized findings with exact phrases and smallest fixes, and an evidence boundary.

The draft claimed a routing system “transformed support” and “proved” causation even though ticket volume fell 22%, two contractors joined, and no controlled analysis was run. It also called a 4.1-to-4.2 satisfaction change at an 18% response rate “much happier” and recommended every team copy the rollout.

## With Addictive Writing — 140 words

> **Reader contract:** This review assesses whether the reported four-week results justify the draft’s causal, satisfaction, and broader adoption claims.
>
> 1. **Causality:** “This proves the routing logic made the team faster” ignores the 22% ticket-volume decline, two added contractors, and lack of controlled analysis; replace “proves” with “is consistent with.”
>
> 2. **Customer sentiment:** “Customers were much happier too” overstates a 0.1-point increase from a survey with an 18% response rate; change “much happier” to “reported slightly higher satisfaction among respondents.”
>
> 3. **Generalization:** “an unqualified success that every support team should copy” contradicts the draft’s stated limitations and extends one team’s short-term result to all teams; remove “unqualified” and “every support team should copy.”
>
> **Evidence boundary:** The evidence supports a four-week association between the rollout and improved observed metrics, but not routing-specific causation, broad customer happiness, or transferability to other support teams.

## Why it lost

The diagnosis was substantively correct, but the literal substitutions would make the original sentences ungrammatical without additional rewriting. The baseline paired its causal hedge with an instruction to acknowledge the confounders and gave more directly applicable fixes.

- Blind preference: skill 0, baseline 4, ties 0
- Mean score: skill 53.5, baseline 57.5 out of 60
- Hard factual/task checks: the skill passed all of them

This is a current limitation, not a hidden test artifact. [Inspect the complete pair and judgments](../evals/results/holdout-v1.json).
