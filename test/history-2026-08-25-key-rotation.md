# What a rate-limited key costs a run — 2026-08-25

Every number here was measured, not estimated. Two harnesses: `resume-harness.ts`
against a mocked Google (deterministic, free), and `e2e-local.ts` against the
real API with a contributor's own key file (16 keys, 10–25 Whisk PNGs, Adobe
profile, the hardcoded 2 workers).

The question was the one a user asked: eight workers and thirty keys, and a
per-minute 429 parks a worker for a minute while the other keys sit idle. Can
it take a different key, and can it take a different model?

## Before

`runner.ts` pinned one worker to one key for the life of the run. A 429
requeued the file and then `await sleep(keys.waitFor(keyIndex))` — the worker
sat on the cooling key. Reserve keys were pulled in only when a worker *exited*,
which happens on key death, abort or an empty queue. A cooldown never released
anything.

## Synthetic: mocked Google, 6 files, a 60 s `retryDelay`

| Scenario | Before | After |
|---|---|---|
| 4 keys, 2 workers, key 1's fast rung 429s | **60.0 s**, peak 1 request in flight | **0.5 s**, peak 2, key 1 swapped out |
| 1 key, 1 worker, fast rung 429s | aborted at the 2-minute mark | **1.0 s**, 6 files answered a rung down, key still on rung 0 |

`bun test/resume-harness.ts <folder> ratelimit`, `KEYS` deciding which row.

## Real API

| # | Setup | Result | What it showed |
|---|---|---|---|
| 1 | 10 files, all 16 keys | 10/10, 4 files on the deep rung, **no 429 at all** | **Bug.** Borrowing fired on the 4 s pacing gap between requests, not on a cooldown. 3.3 s answer → 0.7 s of slot left → a 6 s model was used to save it. |
| 1b | same, after "cooldown only" | 10/10 in 23 s, all on the fast rung | Fixed. |
| 2 | 10 files, keys `[A, A, B]` | 10/10 in 23 s, no 429 | Ten requests never reach a fifteen-a-minute limit. Needed a longer run. |
| 2b | 25 files, `[A, A, B]` | 25/25 in **98 s**, 4 real 429s → 2 swaps + 2 borrows | Both paths, first time on real 429s. Also: Google's `retryDelay` was **1–2 s**, not 60 — it is the distance to the next per-minute window, so a 429 can cost one second or fifty-nine. Borrowing a 6 s model to save 1 s is a loss. |
| 3 | 25 files, `[A, A, B]`, **pre-change code** | 25/25 in **115 s**, key 3 made **0 requests** all run | The complaint, reproduced: the spare key was never touched, because no worker ever exited. |
| 4 | 25 files, `[A, A, B]`, after the worth-it rule | 25/25 in 51 s, no 429 (the window had reset), all fast rung | No borrowing without a cooldown — the run 1 bug stays fixed. |
| 5 | same, run back-to-back so the window was hot | 25/25 in **73 s**, 3 real 429s → **2 swaps + 6 borrows**, 19 fast / 6 deep, no key demoted or dead | All three behaviours in one real run. |

Duplicating one key in the file is the lever that makes this testable at all:
the per-minute limit is per *project*, so two workers on the same project
collide on purpose within a minute. It is an e2e-only trick — the app dedupes
pasted keys.

## What the two rules ended up being

A worker borrows the rung below only when **the key is actually stopped** (a
cooldown, not the pacing between requests) and **the arithmetic favours it**:
waiting costs the wait plus a file here, borrowing costs a file down there.
`perFileMs` on `LadderRung` is in the ladder for exactly this — 3.8 s and 6.0 s,
measured 2026-08-23 — so the decision is a comparison rather than a magic
number.

Order of preference, cheapest quota first: swap to a ready key, then borrow the
rung below, then wait.

## Not tested here

The signed-in path (browser, IndexedDB resume, the key rail's countdown) —
`e2e-local.ts` bypasses accounts by design. Someone has to watch one real run
on the Generate screen.
