// Grades an optimizer by what the REFERENCE calculator says about the spread it returns, not by what the engine believes.
// scoreOptimizer(engine, problems) -> per-problem goal chances; compareEngines() lines two engines up on the same problems.
//   engine = any module exposing runOptimizer(...) with the app's signature (the live engine, or the frozen legacy copy).
import { generateScenarios, rng } from './scenarios.js'
import { makeGoal, moveFields, battleConditionsFor } from './compare.js'
import { resolveGoals } from '../../src/lib/goalResolver.js'
import { staticTypeMultiplier } from '../../src/lib/typeChart.js'
import { speciesToPokeApi, referenceHit, buildRefPokemon, STAT_FULL } from './reference.js'
import { STAT_KEYS } from '../../src/lib/pokemonMath.js'

const flat = () => Object.fromEntries(STAT_KEYS.map(k => [k, 31]))

// A problem = one of your Pokémon + 1-4 goals (survive / KO / outspeed), neutral field, no items or abilities.
export function generateProblems(count, seed = 1, { minGoals = 1, maxGoals = 4, surviveHits = 1, koHits = 1 } = {}) {
  const r = rng(seed * 7919 + 1)
  const pool = generateScenarios(count * 25, seed).filter(s => s.tier === 'bare')
  const problems = []
  let cursor = 0
  for (let i = 0; i < count; i++) {
    const k = minGoals + Math.floor(r() * (maxGoals - minGoals + 1))
    const first = pool[cursor++]
    const level = first.level
    const goals = []
    for (let g = 0; g < k; g++) {
      const roll = r()
      const base = pool[cursor++]
      if (roll < 0.25) goals.push({ type: 'outspeed', opp: base.opp })
      else goals.push({ type: base.direction, move: base.move, opp: base.opp })
    }
    problems.push({ id: i, level, you: { species: first.you.species }, goals, surviveHits, koHits })
  }
  return problems
}

export async function buildEngineInputs(p) {
  const youData = speciesToPokeApi(p.you.species)
  const koMoves = p.goals.filter(g => g.type === 'ko').map(g => g.move)
  const moves = [...new Set(koMoves.map(m => m.slug))]
  const userMoveCategories = moves.map(slug => koMoves.find(m => m.slug === slug).category)
  const goals = []
  p.goals.forEach((g, idx) => {
    const id = idx + 1
    const oppData = speciesToPokeApi(g.opp.species)
    if (g.type === 'outspeed') {
      goals.push({ id, type: 'outspeed', opponentName: oppData.name, opponentLevel: p.level, opponentAbility: '', opponentItem: '', opponentNature: g.opp.nature,
        opponentIvs: g.opp.ivs, opponentEvs: g.opp.evs, opponentStages: g.opp.stages, opponentHpPercent: 100, opponentTypes: oppData.types.map(t => t.type.name),
        opponentBaseSpeed: oppData.stats.find(s => s.stat.name === 'speed').base_stat })
      return
    }
    const sc = { direction: g.type, level: p.level, move: g.move, opp: g.opp }
    const attackerData = g.type === 'survive' ? oppData : youData
    const { offKey, defKey } = moveFields(g.move, attackerData)
    const goal = makeGoal(sc, youData, oppData, offKey, defKey, id)
    if (goal.type === 'survive') goal.surviveHits = p.surviveHits ?? 1
    else goal.koHits = p.koHits ?? 1
    goals.push(goal)
  })
  const bc = battleConditionsFor({ you: { status: 'none' }, opp: { status: 'none' }, field: { gameFormat: 'singles', weather: 'none', terrain: 'none' }, direction: 'ko', crit: false, level: p.level })
  const ctx = { pokemonData: youData, userAbility: '', userItem: '', userStatStages: {}, battleConditions: bc, gameFormat: 'singles', level: p.level, championsMode: false,
    typeMultiplier: async (t, d) => staticTypeMultiplier(t, d) }
  const resolved = await resolveGoals(goals, ctx)
  return { youData, goals: resolved, userMoveCategories, bc }
}

// The reference's verdict on each goal for a returned spread.
function refChances(p, result, goalsIn) {
  const you = { species: p.you.species, nature: result.natureName, evs: result.evsNeeded, ivs: flat(), item: '', ability: '', status: 'none', stages: {} }
  return p.goals.map((g, idx) => {
    if (g.type === 'outspeed') {
      const mine = buildRefPokemon(you, p.level).stats.spe, theirs = buildRefPokemon(g.opp, p.level).stats.spe
      return mine > theirs ? 1 : mine === theirs ? 0.5 : 0
    }
    const field = { gameFormat: 'singles', weather: 'none', terrain: 'none' }
    if (g.type === 'survive') {
      const hit = referenceHit(g.opp, you, p.level, g.move.slug, false, field, 'opp', 'your')
      return hit ? hit.rolls.filter(d => d < hit.hp).length / hit.rolls.length : 0
    }
    const hit = referenceHit(you, g.opp, p.level, g.move.slug, false, field, 'your', 'opp')
    return hit ? hit.rolls.filter(d => d >= hit.hp).length / hit.rolls.length : 0
  })
}

export async function scoreOptimizer(engine, problems, extraArgs = []) {
  const rows = []
  for (const p of problems) {
    const { youData, goals, userMoveCategories, bc } = await buildEngineInputs(p)
    const t0 = performance.now()
    let res
    try { res = engine.runOptimizer({ ...youData, canEvolve: youData.canEvolve }, flat(), p.level, goals, userMoveCategories, '', '', bc, 'singles', {}, true, true, ...extraArgs) } catch (e) { res = { error: String(e?.message ?? e) } }
    const ms = performance.now() - t0
    if (!res || res.infeasible || res.error) { rows.push({ id: p.id, answered: false, error: res?.error, chances: p.goals.map(() => 0), cost: null, ms }); continue }
    const chances = refChances(p, res, goals)
    rows.push({ id: p.id, answered: true, chances, cost: res.totalCost, nature: res.natureName, degraded: res.degraded ?? null, ms })
  }
  return rows
}

const sum = (a) => a.reduce((x, y) => x + y, 0)
export function summarize(rows) {
  const n = rows.length
  const goalCount = sum(rows.map(r => r.chances.length))
  return {
    problems: n,
    answeredPct: +(100 * rows.filter(r => r.answered).length / n).toFixed(1),
    meanGoalChancePct: +(100 * sum(rows.map(r => sum(r.chances))) / goalCount).toFixed(2),
    allGoalsCertainPct: +(100 * rows.filter(r => r.chances.every(c => c >= 0.999)).length / n).toFixed(1),
    meanMs: +(sum(rows.map(r => r.ms)) / n).toFixed(1),
    maxMs: +Math.max(...rows.map(r => r.ms)).toFixed(0)
  }
}

export function compareEngines(rowsA, rowsB, eps = 1e-9) {
  let better = 0, worse = 0, same = 0
  const regressions = []
  rowsA.forEach((a, i) => {
    const b = rowsB[i]
    const d = sum(b.chances) - sum(a.chances)
    if (d > eps) better++
    else if (d < -eps) { worse++; regressions.push({ id: a.id, before: a.chances, after: b.chances, beforeCost: a.cost, afterCost: b.cost }) }
    else same++
  })
  return { better, worse, same, regressions }
}
