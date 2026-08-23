/**
 * The paste rules, checked without a session, a database or Google.
 *
 *   bun test/key-plan.ts
 *
 * Every case here is one somebody actually met or nearly met. The first is the
 * bug that started it: an account at the cap, re-pasting the file it was built
 * from, told it was "past 20 keys" when nothing new was in the paste at all.
 */
import { planKeyAdditions } from '#/lib/server/gemini-keys'
import { previewOf } from '#/lib/server/crypto'

// Real keys start AIzaSy and differ in the tail, so the fixtures do too —
// a fixture where every key shares a preview tests the wrong thing, and
// this one did until it failed.
const key = (n: number) =>
  `AIzaSyFAKE${String(n).padStart(2, '0')}KEY00000000000000${String(n).padStart(4, '7')}`

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

const twenty = Array.from({ length: 20 }, (_, i) => key(i))
const heldTwenty = twenty.map(previewOf)

console.log('re-pasting a file the account was built from')
{
  const plan = planKeyAdditions(twenty, heldTwenty, 20)
  check('nothing accepted', plan.accept.length, 0)
  check('all recognised as held', plan.alreadyHeld, 20)
  check('no overflow claimed', plan.overflow, 0)
}

console.log('the same file with five new keys appended, cap 100')
{
  const lines = [...twenty, ...Array.from({ length: 5 }, (_, i) => key(50 + i))]
  const plan = planKeyAdditions(lines, heldTwenty, 100)
  check('only the new five accepted', plan.accept.length, 5)
  check('twenty recognised as held', plan.alreadyHeld, 20)
  check('no overflow', plan.overflow, 0)
}

console.log('more new keys than the cap has room for')
{
  const lines = Array.from({ length: 10 }, (_, i) => key(60 + i))
  const plan = planKeyAdditions(lines, heldTwenty, 25)
  check('takes what fits', plan.accept.length, 5)
  check('reports the rest', plan.overflow, 5)
  check('none were held', plan.alreadyHeld, 0)
}

console.log('a real gemini-key.txt: comments, blanks, placeholder, duplicates')
{
  const lines = [
    '# my keys',
    '',
    key(1),
    '   ' + key(2) + '  ',
    key(1),
    'your_api_key_here',
    '# spare',
    key(3),
  ]
  const plan = planKeyAdditions(lines, [], 100)
  check('three distinct keys survive', plan.accept.length, 3)
  check('whitespace trimmed off', plan.accept[1].key, key(2))
  check('the in-paste duplicate is not an error', plan.alreadyHeld, 0)
}

console.log('an account already over the cap')
{
  const plan = planKeyAdditions([key(90)], heldTwenty, 10)
  check('accepts nothing', plan.accept.length, 0)
  check('and says so', plan.overflow, 1)
}

console.log('')
if (failures > 0) {
  console.log(`${failures} failing`)
  process.exit(1)
}
console.log('all good')
