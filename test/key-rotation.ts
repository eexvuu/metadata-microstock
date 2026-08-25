/**
 * What a rate-limited key costs a run, checked without Google.
 *
 *   bun test/key-rotation.ts
 *
 * The bug that started this: eight workers, thirty keys, and a per-minute 429
 * parked a worker for a full minute while twenty-two keys sat unused. Every
 * case here is about the bench — who may pick a key up, when, and what
 * happens to the one that had to wait.
 */
import { GeminiError } from '#/lib/engine/gemini'
import { KeyPool, RATE_LIMIT_COOLDOWN_MS } from '#/lib/engine/keys'
import { MODEL_LADDER } from '#/lib/generator/settings'

const noop = () => {}
const keys = (n: number) => Array.from({ length: n }, (_, i) => `key-${i}`)
const pool = (n: number) => new KeyPool(keys(n), noop, MODEL_LADDER)

/** The per-minute 429, as Google actually sends it. */
const perMinute = (retrySeconds = 27) =>
  new GeminiError(
    '[429] Resource exhausted',
    429,
    'GenerateRequestsPerMinutePerProjectPerModel-FreeTier',
    retrySeconds * 1000,
  )

const perDay = () =>
  new GeminiError('[429] Resource exhausted', 429, 'GenerateRequestsPerDayPerProjectPerModel-FreeTier')

let failures = 0

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}\n         expected ${e}\n         got      ${a}`)
  }
}

console.log('thirty keys, eight workers, one of them rate-limited')
{
  const p = pool(30)
  const held = Array.from({ length: 8 }, () => p.lease())
  check('eight distinct keys leased', new Set(held).size, 8)
  check('they are the first eight', held, [0, 1, 2, 3, 4, 5, 6, 7])

  const unlucky = held[3]!
  check('the 429 does not kill the key', p.handleRateLimit(unlucky, perMinute()), false)

  const relief = p.swap(unlucky)
  check('a bench key takes over immediately', relief, 8)
  check('it is not one another worker holds', held.includes(relief!), false)
  check('the cooled key still has its wait', p.waitFor(unlucky) > 26000, true)
}

console.log('a cooled key is picked up again once it has served its time')
{
  const p = pool(2)
  const first = p.lease()
  p.handleRateLimit(first!, perMinute(1))
  check('nothing else is ready yet', p.swap(first!), 1)
  // The bench holds key 0 with a one-second cooldown and nothing else.
  await new Promise((resolve) => setTimeout(resolve, 1100))
  check('it comes back off the bench', p.lease({ readyNow: true }), first)
}

console.log('a key nobody has released is never handed out twice')
{
  const p = pool(3)
  check('three leases', [p.lease(), p.lease(), p.lease()], [0, 1, 2])
  check('and then nothing', p.lease(), null)
  p.release(1)
  check('until one is handed back', p.lease(), 1)
}

console.log('the bench is empty: the worker keeps the key and waits')
{
  const p = pool(1)
  const only = p.lease()
  p.handleRateLimit(only!, perMinute())
  check('no swap on offer', p.swap(only!), null)
  check('not the flat minute', p.waitFor(only!) > RATE_LIMIT_COOLDOWN_MS - 2000, false)
  check('it is the retryDelay Google sent', Math.round(p.waitFor(only!) / 1000), 27)
}

console.log('a demoted key steps aside only for one still on the fast rung')
{
  const p = pool(4)
  const held = p.lease()!
  const other = p.lease()!
  p.handleRateLimit(held, perDay())
  check('it demoted rather than died', p.stats()[held].rung, 1)

  const relief = p.swap(held, { maxRung: 0 })
  check('a fast-rung key takes over', relief, 2)
  check('and it is a fresh one', relief === other, false)

  // Now demote everything on the bench too: there is no fast rung left to
  // swap for, and the demoted key is working, not waiting.
  p.handleRateLimit(relief!, perDay())
  for (const index of [1, 3]) p.handleRateLimit(index, perDay())
  check('no swap when nobody is faster', p.swap(relief!, { maxRung: 0 }), null)
}

console.log('a key with nothing left to spend is off the bench for good')
{
  const p = pool(2)
  const held = p.lease()!
  p.handleRateLimit(held, perDay())
  check('rung 1 now', p.stats()[held].rung, 1)
  check('the last rung ends the key', p.handleRateLimit(held, perDay()), true)
  p.release(held)
  check('and it is never leased again', p.lease(), 1)
  check('nothing else on the bench', p.lease(), null)
}

console.log('a key every queued file has already refused is no help')
{
  const p = pool(3)
  const held = p.lease()!
  p.handleRateLimit(held, perMinute())
  check('the bench is filtered by the caller', p.swap(held, { usable: () => false }), null)
  check('and unfiltered it is not', p.swap(held, { usable: (index) => index === 2 }), 2)
}

console.log('one key and nowhere to swap: the rung below is borrowed, not slept through')
{
  const p = pool(1)
  const only = p.lease()!
  p.handleRateLimit(only, perMinute())
  check('nobody to take over', p.swap(only), null)
  check('so the deep rung answers instead', p.borrowRung(only), 1)
  check('and the key keeps its own rung', p.stats()[only].rung, 0)

  // A 429 on a borrowed rung is that rung's problem, not the key's.
  check('the borrowed rung cools on its own', p.handleRateLimit(only, perMinute(5), 1), false)
  check('still rung 0', p.stats()[only].rung, 0)
  check('and nothing left to borrow', p.borrowRung(only), null)
}

console.log('a rung is borrowed only while the key is actually stopped')
{
  const p = pool(1)
  const only = p.lease()!
  check('a ready key borrows nothing', p.borrowRung(only), null)
  p.handleRateLimit(only, perMinute(3))
  check('a cooling one does', p.borrowRung(only), 1)
  await new Promise((resolve) => setTimeout(resolve, 3100))
  check('and stops the moment it can work again', p.borrowRung(only), null)
}

console.log('a cooldown shorter than the slower model is just waited out')
{
  // Measured on the real API: Google's retryDelay is the distance to the next
  // per-minute window, and four of the 429s in the second run were one to two
  // seconds away from it. Waiting 1 s and taking 3.8 s beats a 6 s answer.
  const p = pool(1)
  const only = p.lease()!
  p.handleRateLimit(only, perMinute(1))
  check('the key is cooling', p.waitFor(only) > 0, true)
  check('but the slower model would be slower still', p.borrowRung(only), null)
}

console.log("a borrowed rung that is out for the day is not borrowed again")
{
  const p = pool(1)
  const only = p.lease()!
  p.handleRateLimit(only, perMinute())
  check('borrowable at first', p.borrowRung(only), 1)
  check('the day is gone down there', p.handleRateLimit(only, perDay(), 1), false)
  check('the key did not move', p.stats()[only].rung, 0)
  check('and there is nothing to borrow', p.borrowRung(only), null)

  // The key's own rung runs out next: demote must walk past the rung the
  // borrow already found empty rather than stepping onto it.
  check('so demoting ends the key', p.handleRateLimit(only, perDay()), true)
}
console.log('pacing itself is not the same as being told to wait')
{
  // The bug the first real run found: a file that answers in 3.3 s leaves
  // 0.7 s of a fifteen-a-minute slot, and that is not a reason to spend a
  // different model's quota.
  const p = pool(1)
  const only = p.lease()!
  p.markRequest(only)
  check('the key does have to wait', p.waitFor(only) > 0, true)
  check('and borrows nothing for it', p.borrowRung(only), null)
}
console.log('')
if (failures > 0) {
  console.log(`${failures} failing`)
  process.exit(1)
}
console.log('all good')
