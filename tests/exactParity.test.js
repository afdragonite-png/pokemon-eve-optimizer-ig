// Zero-tolerance checks that the damage engine reproduces @smogon/calc roll for roll.
import { describe, it, expect } from 'vitest'
import { generateScenarios } from './parity/scenarios.js'
import { runScenario, compareHit } from './parity/compare.js'

const MOVES = {
  'flying-press': { slug: 'flying-press', name: 'Flying Press', type: 'fighting', power: 100, category: 'physical', hasSecondary: false, target: 'any' },
  'freeze-dry': { slug: 'freeze-dry', name: 'Freeze-Dry', type: 'ice', power: 70, category: 'special', hasSecondary: true, target: 'normal' }
}

describe('exact parity with @smogon/calc', () => {
  for (const [slug, mv] of Object.entries(MOVES)) {
    it(`${slug}: all 16 rolls identical over 600 random matchups (with items / abilities / field)`, async () => {
      const scs = generateScenarios(600, 7).map(sc => ({ ...sc, move: mv }))
      const bad = []
      for (const sc of scs) {
        const run = await runScenario(sc)
        if (run.skipped) continue
        if (!compareHit(run).exact) bad.push({ id: sc.id, features: sc.features, you: sc.you.species, opp: sc.opp.species })
      }
      expect(bad.slice(0, 5)).toEqual([])
    }, 120000)
  }
  it('the random sweep (seed 5, 8000 matchups) is 100% identical', async () => {
    let n = 0
    const bad = []
    for (const sc of generateScenarios(8000, 5)) {
      const run = await runScenario(sc)
      if (run.skipped) continue
      n++
      if (!compareHit(run).exact) bad.push({ id: sc.id, move: sc.move.slug, features: sc.features })
    }
    expect(n).toBeGreaterThan(7000)
    expect(bad.slice(0, 5)).toEqual([])
  }, 240000)
})
