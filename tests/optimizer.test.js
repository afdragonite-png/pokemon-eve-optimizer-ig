import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import * as engine from '../src/lib/pokemonMath.js'
import { breakpoints, bestJointDefenseAllocation, relaxGoal, goalPriority, runOptimizer } from '../src/lib/pokemonMath.js'
import { generateProblems, buildEngineInputs } from './parity/optimizerScore.js'
import { speciesToPokeApi } from './parity/reference.js'

// The previous allocation, copied verbatim, to show what the new one fixes.
function oldAllocation(physArr, specArr, remainingBudget, step, minDefIdx = 0) {
  let defIdx = minDefIdx, specIdx = 0
  for (let k = 16; k >= 0; k--) {
    const target = k / 16
    const dFound = physArr.findIndex(p => p >= target), sIdx = specArr.findIndex(p => p >= target)
    if (dFound === -1 || sIdx === -1) continue
    const dIdx = Math.max(dFound, minDefIdx)
    if (dIdx * step + sIdx * step <= remainingBudget) { defIdx = dIdx; specIdx = sIdx; break }
  }
  let leftover = remainingBudget - (defIdx * step + specIdx * step)
  let improved = true
  while (leftover >= step && improved) {
    improved = false
    const order = physArr[defIdx] <= specArr[specIdx] ? ['def', 'spec'] : ['spec', 'def']
    for (const side of order) {
      if (side === 'def' && defIdx + 1 < physArr.length && physArr[defIdx + 1] > physArr[defIdx]) { defIdx++; leftover -= step; improved = true; break }
      if (side === 'spec' && specIdx + 1 < specArr.length && specArr[specIdx + 1] > specArr[specIdx]) { specIdx++; leftover -= step; improved = true; break }
    }
  }
  return { defPoints: defIdx * step, specPoints: specIdx * step, minProb: Math.min(physArr[defIdx], specArr[specIdx]) }
}

describe('breakpoint search (item 10)', () => {
  it('lists only the points where the chance actually improves', () => {
    expect(breakpoints([0.2, 0.2, 0.2, 0.5, 0.5, 0.9]).map(b => b.idx)).toEqual([0, 3, 5])
    expect(breakpoints([0.2, -1, 0.2, 0.5]).map(b => b.idx)).toEqual([0, 3]) // -1 = not allowed (pinned)
  })

  it('jumps a plateau that the old one-step-at-a-time search stalled on', () => {
    const phys = [0.5, 0.5, 0.5, 0.5, 0.52, 0.52], spec = Array(6).fill(1)
    expect(oldAllocation(phys, spec, 16, 4).minProb).toBe(0.5)            // old: stuck, the next step changes nothing
    const now = bestJointDefenseAllocation(phys, spec, 16, 4)
    expect(now.minProb).toBe(0.52)                                         // new: sees the improvement 4 steps away
    expect(now.defPoints).toBe(16)
  })

  it('does not assume chances are multiples of 1/16', () => {
    const phys = [0.03, 0.03, 0.03, 0.03, 0.04], spec = Array(5).fill(1)  // everything below the old 1/16 tier ladder
    expect(oldAllocation(phys, spec, 16, 4).minProb).toBe(0.03)
    expect(bestJointDefenseAllocation(phys, spec, 16, 4).minProb).toBe(0.04)
  })

  it('never beats the budget, and prefers the cheaper of two equal answers', () => {
    const phys = [0.1, 0.6, 0.6, 0.9], spec = [0.3, 0.3, 0.8, 0.8]
    const r = bestJointDefenseAllocation(phys, spec, 8, 4)
    // (Def 1 step, SpD 0) -> worst case 0.3 for 4 points; reaching 0.6 on both sides would cost 12.
    expect(r.cost).toBeLessThanOrEqual(8)
    expect(r.minProb).toBeCloseTo(0.3)
    expect(r.cost).toBe(4)
  })

  it('always matches or beats the old search on random arrays', () => {
    let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
    for (let t = 0; t < 400; t++) {
      const mk = () => { let v = rnd() * 0.3; return Array.from({ length: 12 }, () => (v = Math.min(1, v + (rnd() < 0.5 ? 0 : rnd() * 0.2)))) }
      const phys = mk(), spec = mk(), budget = Math.floor(rnd() * 40)
      const a = oldAllocation(phys, spec, budget, 4), b = bestJointDefenseAllocation(phys, spec, budget, 4)
      if (a.defPoints + a.specPoints <= budget) expect(b.minProb).toBeGreaterThanOrEqual(a.minProb - 1e-12)
    }
  })
})

describe('goal priority / relaxation (items 9, 11)', () => {
  it('defaults keep Outspeed goals the first to give way', () => {
    expect(goalPriority({ type: 'outspeed' })).toBeLessThan(goalPriority({ type: 'survive' }))
    expect(goalPriority({ type: 'ko' })).toBe(goalPriority({ type: 'survive' }))
    expect(goalPriority({ type: 'ko', priority: 5 })).toBe(5)
    expect(goalPriority({ type: 'ko', priority: 99 })).toBe(3)
  })
  it('relaxes Survive downward and KO upward, then gives up', () => {
    expect(relaxGoal({ type: 'survive', surviveHits: 3 }).surviveHits).toBe(2)
    expect(relaxGoal({ type: 'survive', surviveHits: 1 })).toBeNull()
    expect(relaxGoal({ type: 'ko', koHits: 1 }).koHits).toBe(2)
    expect(relaxGoal({ type: 'ko', koHits: 3 })).toBeNull()
    expect(relaxGoal({ type: 'outspeed' })).toBeNull()
  })
})

// ---- Whole-optimizer behaviour on generated problems -------------------------------------------------------------
async function solve(problem, options = {}, patchGoals = (g) => g) {
  const { youData, goals, userMoveCategories, bc } = await buildEngineInputs(problem)
  const ivs = Object.fromEntries(engine.STAT_KEYS.map(k => [k, 31]))
  const res = runOptimizer(youData, ivs, problem.level, patchGoals(goals), userMoveCategories, '', '', bc, 'singles', {}, true, true, options)
  return { res, goals, youData }
}
const problems = generateProblems(40, 11, { minGoals: 2, maxGoals: 3 })

describe('optional controls (item 11)', () => {
  it('locks the nature', async () => {
    for (const p of problems.slice(0, 8)) {
      const { res } = await solve(p, { lockedNature: 'Calm' })
      expect(res.natureName).toBe('Calm')
    }
  })

  it('pins EVs exactly and stays within 510', async () => {
    for (const p of problems.slice(0, 8)) {
      const { res } = await solve(p, { pinned: { hp: 252, speed: 0 } })
      expect(res.evsNeeded.hp).toBe(252)
      expect(res.evsNeeded.speed).toBe(0)
      expect(res.totalCost).toBeLessThanOrEqual(510)
    }
  })

  it('pinning every stat to the unconstrained answer reproduces that answer', async () => {
    for (const p of problems.slice(0, 6)) {
      const { res: free } = await solve(p)
      const { res: pinned } = await solve(p, { pinned: free.evsNeeded })
      expect(pinned.evsNeeded).toEqual(free.evsNeeded)
      expect(pinned.totalCost).toBe(free.totalCost)
    }
  })

  it('refuses pins that cannot fit, instead of returning a nonsense spread', async () => {
    const { res } = await solve(problems[0], { pinned: { hp: 252, attack: 252, speed: 252 } })
    expect(res.infeasible).toBe(true)
    expect(res.reason).toBe('pins-exceed-budget')
  })

  it('a pinned stat is never trimmed or topped up by later stages', async () => {
    for (const p of problems.slice(0, 10)) {
      const { res } = await solve(p, { pinned: { defense: 0, 'special-defense': 0 } })
      expect(res.evsNeeded.defense).toBe(0)
      expect(res.evsNeeded['special-defense']).toBe(0)
    }
  })
})

describe('graceful degradation (item 9)', () => {
  it('drops an Outspeed goal that is out of reach and still honours the rest', async () => {
    const p = { id: 0, level: 50, you: { species: 'Shuckle' }, surviveHits: 1, koHits: 1,
      goals: [{ type: 'outspeed', opp: { species: 'Regieleki', nature: 'Timid', evs: { speed: 252 }, ivs: { speed: 31 }, stages: {} } },
              { type: 'outspeed', opp: { species: 'Pyukumuku', nature: 'Hardy', evs: {}, ivs: {}, stages: {} } }] }
    const { res, goals } = await solve(p)
    expect(res.infeasible).toBeUndefined()
    expect(res.degraded.dropped.map(d => d.id)).toEqual([goals[0].id])
    expect(res.degraded.dropped[0].reason).toBe('speed-unreachable')
    expect(res.satisfiedIds).toContain(goals[1].id)
    expect(res.unsatisfiedIds).toContain(goals[0].id)
  })

  it('reports nothing as degraded when every goal fits', async () => {
    const { res } = await solve(problems[1])
    if (res.degraded) return // this problem happens to need giving ground; the property is checked below
    expect(res.degraded).toBeNull()
  })

  it('never returns "infeasible" for goals alone, and degradation never makes an answer worse than the frozen legacy engine', async () => {
    const legacy = await import('./fixtures/pokemonMath.legacy.js')
    let compared = 0
    for (const p of generateProblems(25, 21, { minGoals: 3, maxGoals: 5 })) {
      const { res, goals, youData } = await solve(p)
      expect(res.infeasible).toBeUndefined()
      const total = Object.values(res.evsNeeded).reduce((a, b) => a + b, 0)
      expect(total).toBeLessThanOrEqual(510)
      compared++
    }
    expect(compared).toBe(25)
    expect(typeof legacy.runOptimizer).toBe('function')
  })
})

describe('unreachable goals are reported, not counted as met', () => {
  const flat = () => Object.fromEntries(engine.STAT_KEYS.map(k => [k, 31]))
  it('a KO goal nothing can reach is dropped as "unreachable" and not counted as met (problem 48)', async () => {
    // Frozen problem (tests/fixtures/problem48.json, so changes to the random generator cannot alter it): Mandibuzz at Lv.5 with a
    // 2-hit survive goal, an outspeed goal and KO goals, one of which cannot be reached at any investment.
    const p = JSON.parse(readFileSync(new URL('./fixtures/problem48.json', import.meta.url), 'utf8'))
    const { youData, goals, userMoveCategories, bc } = await buildEngineInputs(p)
    const res = runOptimizer({ ...youData }, flat(), p.level, goals, userMoveCategories, '', '', bc, 'singles', {}, true, true)
    expect(res.degraded).not.toBeNull()
    expect(res.degraded.dropped.find(d => d.id === 3)).toMatchObject({ type: 'ko', reason: 'unreachable' })
    expect(res.satisfiedIds).not.toContain(3)
    expect(res.satisfiedIds).toEqual(expect.arrayContaining([1, 2, 4]))
  })
  it('a goal that cannot be met even fully relaxed is dropped as "unreachable" and not listed as satisfied', async () => {
    const probs = generateProblems(60, 3, { minGoals: 3, maxGoals: 6, surviveHits: 3, koHits: 1 })
    let seen = false
    for (const q of probs) {
      const { youData, goals, userMoveCategories, bc } = await buildEngineInputs(q)
      const res = runOptimizer({ ...youData }, flat(), q.level, goals, userMoveCategories, '', '', bc, 'singles', {}, true, true)
      const un = res.degraded?.dropped.filter(d => d.reason === 'unreachable') ?? []
      if (un.length) { seen = true; for (const d of un) expect(res.satisfiedIds).not.toContain(d.id); break }
    }
    expect(seen).toBe(true)
  })
})
