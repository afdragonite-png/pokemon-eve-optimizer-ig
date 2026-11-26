// Runs the damage engine against @smogon/calc and fails if it gets WORSE than the saved baseline.
// Improvements pass and say so; run `npm run parity:baseline` to lock them in.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { runParity, DEFAULTS } from './parity/cli.js'
import { renderReport } from './parity/report.js'

const baselinePath = new URL('./parity/baseline.json', import.meta.url)
const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : null
const TOL = 0.5 // percentage points

describe('damage engine vs @smogon/calc', () => {
  let report
  it('runs the sweep without errors', async () => {
    report = await runParity({ n: baseline?.meta?.n ?? DEFAULTS.n, seed: baseline?.meta?.seed ?? DEFAULTS.seed })
    mkdirSync(new URL('./reports/', import.meta.url), { recursive: true })
    writeFileSync(new URL('./reports/parity-report.md', import.meta.url), renderReport(report, { baseline }))
    expect(report.errors, JSON.stringify(report.errorSamples)).toBe(0)
    expect(report.skipped).toBeLessThan(report.scenarios * 0.1) // only moves the calc itself does not model (Super Fang, OHKO moves, ...)
  })

  it('stat formulas match exactly (apart from known exceptions)', () => {
    expect(report.statParity.unknown).toEqual([])
  })

  it('every tier matches roll for roll (zero rounding differences)', () => {
    expect(report.tiers.bare.exactPct).toBe(100)
    expect(report.tiers.single.exactPct).toBe(100)
    expect(report.tiers.mixed.exactPct).toBe(100)
    expect(report.anyFlipPct).toBe(0)
  })

  it.skipIf(!baseline)('has not regressed against the baseline', () => {
    expect(report.tiers.single.exactPct).toBeGreaterThanOrEqual(baseline.tiers.single.exactPct - TOL)
    expect(report.tiers.mixed.exactPct).toBeGreaterThanOrEqual(baseline.tiers.mixed.exactPct - TOL)
    expect(report.anyFlipPct).toBeLessThanOrEqual(baseline.anyFlipPct + TOL)
    const before = new Map(baseline.byFeature.map(f => [f.key, f.mismatchPct]))
    const worse = report.byFeature.filter(f => before.has(f.key) && f.mismatchPct > before.get(f.key) + 2).map(f => `${f.key}: ${before.get(f.key)}% -> ${f.mismatchPct}%`)
    expect(worse, 'features that got worse').toEqual([])
    if (report.anyFlipPct < baseline.anyFlipPct - TOL) console.log(`parity improved (KO flips ${baseline.anyFlipPct}% -> ${report.anyFlipPct}%): run "npm run parity:baseline" to lock it in`)
  })
})
