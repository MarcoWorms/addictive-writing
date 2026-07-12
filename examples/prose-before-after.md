# Tested prose rewrite: engineering incident

This example comes directly from the frozen holdout evaluation. GPT-5.6-Sol at `ultra` generated both outputs in fresh threads. Four blind judge threads preferred the skill output 4–0. Both outputs passed every hard factual check.

## Task

Rewrite the source as a 130–170 word engineering case-study opening. Make it engaging and causally clear in a restrained technical voice. Preserve every fact, distinguish the confirmed mechanism from timing, and invent no customer, revenue, or business impact.

## Source facts

- At 9:00 on June 18, a cache change was deployed to reduce median catalog load time.
- By 9:30, load time moved from 2.4 to 1.5 seconds while checkout errors moved from 0.8% to 3.1%.
- Logs and reproduction confirmed that some cached pages served expired checkout tokens.
- The change was rolled back at 10:20.
- By 10:35, checkout errors were 0.9% and load time was 2.3 seconds.
- No customer, revenue, or other business impact was estimated.

## Strong-prompt baseline — 162 words

> At 9:00 on June 18, we deployed a cache change intended to reduce median catalog load time. Within 30 minutes, that metric moved from 2.4 seconds to 1.5 seconds. Over the same interval, however, the checkout error rate moved from 0.8% to 3.1%. The timing made the deployment an immediate focus, but it did not by itself establish a failure mechanism. Logs and a reproduction supplied the confirmed finding: some cached pages were serving expired checkout tokens.
>
> We rolled back the cache change at 10:20. By 10:35, checkout errors had fallen to 0.9%, while median catalog load time had risen to 2.3 seconds. The incident therefore presented two kinds of evidence: performance and error-rate changes that coincided with the deployment and rollback, and a specific checkout failure mechanism verified through logs and reproduction. This case study examines that distinction and the technical tradeoffs exposed by the cache change. We have no estimate of customer, revenue, or other business impact.

## With Addictive Writing — 135 words

> At 9:00 on June 18, we deployed a cache change intended to reduce median catalog load time. By 9:30, the median had fallen from 2.4 seconds to 1.5 seconds. Over that same interval, however, the checkout error rate rose from 0.8% to 3.1%. The shared timing suggested a connection, but timing alone did not establish why checkout was failing.
>
> Logs and a reproduction confirmed the mechanism: some cached pages were serving expired checkout tokens. At 10:20, we rolled back the change. By 10:35, the checkout error rate was at 0.9%, while median catalog load time had moved back to 2.3 seconds. The post-rollback movement was consistent with the deployment timeline; the expired-token behavior was the part confirmed directly by evidence. We have no estimate of customer, revenue, or other business impact.

## Result

- Blind preference: skill 4, baseline 0, ties 0
- Mean score: skill 59.0, baseline 56.0 out of 60
- Deterministic word-range check: both passed
- Factual/task checks: both passed every check

[Inspect all four judgments and A/B mappings](../evals/results/holdout-v1.json).
