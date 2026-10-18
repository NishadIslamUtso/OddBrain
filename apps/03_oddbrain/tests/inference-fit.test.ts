import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PROFILE_BUDGET_GB,
  fitCheck,
  fitToProfile,
  vramWarning,
} from '../src/shared/lib/inference'

/**
 * Memory, measured against the profile that was chosen.
 *
 * The bug this file exists for: Settings asked which card the person had, they
 * answered, and then a warning computed against a hardcoded 4 GB told them their
 * answer did not fit. Choosing a profile IS the answer to "how much video memory
 * is there" — so the check has to use the chosen profile's own budget, stay quiet
 * whenever it fits, and make no claim at all for the choices that claim nothing.
 */

const GB = 1e9
/** qwen2.5:3b, the model the app installs against. */
const SMALL = 1.9 * GB
/** qwen3-vl:4b at Q4_K_M: fits a 4 GB card's budget only with a small context. */
const VISION = 3.0 * GB
/** A 4B vision model: its weights alone overflow a 4 GB card's budget. */
const TOO_BIG_FOR_4 = 3.3 * GB
/** Nothing about a card like this one holds this. */
const HUGE = 6.5 * GB

test('the default profile does not warn at the model it was written for', () => {
  assert.equal(vramWarning({ profile: '4gb' }, SMALL), '')
  assert.equal(vramWarning(undefined, SMALL), '')
})

test('answering 6 GB is never answered with a warning about 4', () => {
  // The exact case from the screenshot: a 3B model, 8k context, 6 GB chosen.
  assert.equal(vramWarning({ profile: '6gb' }, SMALL), '')
  const check = fitCheck({ profile: '6gb' }, SMALL)
  assert.equal(check.fits, true)
  assert.equal(check.budgetGb, PROFILE_BUDGET_GB['6gb'])
  assert.ok(check.needGb < check.budgetGb)
})

test('a bigger profile holds what a smaller one cannot', () => {
  assert.notEqual(vramWarning({ profile: '4gb' }, VISION), '')
  assert.equal(vramWarning({ profile: '8gb' }, VISION), '')
})

test('a 4B model on a 4 GB profile is a real limit, not a rounding error', () => {
  // 3.3 GB of weights plus overhead does not fit 3.6 GB at any context, so the
  // honest answer is the CPU-only profile rather than a pretend context.
  assert.notEqual(vramWarning({ profile: '4gb' }, TOO_BIG_FOR_4), '')
  assert.equal(fitToProfile({ profile: '4gb' }, TOO_BIG_FOR_4), null)
  assert.equal(vramWarning({ profile: '8gb' }, TOO_BIG_FOR_4), '')
})

test('choices that claim no card are never warned about', () => {
  assert.equal(vramWarning({ profile: 'cpu' }, HUGE), '')
  assert.equal(vramWarning({ profile: 'custom', customOptions: { num_ctx: 32768 } }, HUGE), '')
  assert.equal(fitCheck({ profile: 'cpu' }, HUGE).budgetGb, 0)
})

test('the warning names the real numbers, not a fixed 4 GB', () => {
  const warning = vramWarning({ profile: '6gb' }, HUGE)
  assert.match(warning, /6\.5 GB|6\.9 GB|7\./)
  assert.match(warning, /budgets 5\.4 GB/)
  assert.doesNotMatch(warning, /fit in 4 GB/)
})

test('fitting lowers the context until the chosen profile holds it, and no further', () => {
  const fitted = fitToProfile({ profile: '4gb' }, VISION)
  assert.ok(fitted, 'a smaller context does fit')
  const check = fitCheck(fitted, VISION)
  assert.equal(check.fits, true)
  const ctx = Number(fitted.customOptions?.num_ctx)
  // A size a person would recognise, not the largest number that happens to fit.
  assert.ok([512, 2048, 4096, 8192, 16384, 32768].includes(ctx), `recognisable context: ${ctx}`)
  assert.ok(ctx > 512, `something had to give: ${ctx}`)
  // Everything other than the context is left as it was.
  assert.equal(fitted.customOptions?.num_batch, '256')
  assert.equal(fitted.customOptions?.num_predict, '1024')
})

test('when even the smallest context does not fit, the honest answer is CPU only', () => {
  assert.equal(fitToProfile({ profile: '4gb' }, HUGE), null)
})

test('there is nothing to fit when no card is claimed', () => {
  assert.equal(fitToProfile({ profile: 'cpu' }, SMALL), null)
  assert.equal(fitToProfile({ profile: 'custom', customOptions: { num_ctx: '4096' } }, SMALL), null)
})
