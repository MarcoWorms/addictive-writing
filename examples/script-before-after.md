# Tested script rewrite: shorter form, lower conversion

This example comes directly from the development evaluation. Four fresh blind judge threads preferred the skill output 4–0. Both conditions received the same strong prompt; only the explicit skill input differed.

## Task

Rewrite the source as a 110–150 word spoken short-form video script. Make it engaging and easy to follow. Preserve every fact and qualification. Add no numbers, motives, or causal claims.

## Source facts

- A signup form was reduced from nine fields to three.
- In a 14-day A/B test, the three-field version’s conversion rate was 18% lower relative to the nine-field version.
- Interviews suggested some removed fields may have signaled seriousness and trust, but did not establish why conversion changed.
- Restoring two fields recovered most, but not all, of the measured loss in a later test.

## Strong-prompt baseline — 135 words

> What happened when our team made a signup form much shorter? We reduced it from nine fields to three, then compared the two versions in a 14-day A/B test. The result: the three-field version’s conversion rate was 18% lower relative to the nine-field version.
>
> In follow-up interviews, people suggested that some removed fields may have signaled seriousness and trust. But that suggestion has an important limit: the interviews do not establish why conversion changed.
>
> Next, the team restored two of the removed fields and ran a later test. That version recovered most of the measured loss, but not all of it.
>
> So, in order: a shorter form performed worse in the first test, interviews raised a possibility without proving an explanation, and restoring two fields recovered most—not all—of the measured loss later.

## With Addictive Writing — 138 words

> We cut our signup form from nine fields to three—and the result wasn’t what you might expect.
>
> In a 14-day A/B test, the three-field version’s conversion rate was 18% lower relative to the nine-field version.
>
> So we followed up with interviews. Those conversations suggested that some removed fields may have signaled seriousness and trust. But that’s only a suggestion: the interviews do not establish why conversion changed.
>
> Then, in a later test, we restored two of the removed fields. That recovered most of the measured loss—but not all of it.
>
> The takeaway? A shorter form didn’t convert better in this test, and the interview findings shouldn’t be mistaken for proof. What we know is limited to what the tests measured: three fields performed worse than nine, while restoring two fields recovered most of the loss.

## Result

- Blind preference: skill 4, baseline 0, ties 0
- Mean score: skill 57.75, baseline 55.75 out of 60
- Deterministic word-range check: both passed
- Factual/task checks: both passed every check

[Inspect all four judgments and A/B mappings](../evals/results/development-v1.json).
