// Runs one scenario through (a) this app's pipeline (resolveGoals -> describe*Hit) and (b) @smogon/calc, and compares.
import { calculateStat, describeSurviveHit, describeKoHit, offensiveStatForMove, defensiveStatForMove, STAT_KEYS } from '../../src/lib/pokemonMath.js'
import { resolveGoals } from '../../src/lib/goalResolver.js'
import { staticTypeMultiplier } from '../../src/lib/typeChart.js'
import { speciesToPokeApi, referenceHit, calculate, buildRefPokemon, TO_SHORT, STAT_FULL, GEN } from './reference.js'
import { setGeneration } from '../../src/lib/generation.js'
import { attackerOf, defenderOf } from './scenarios.js'
import { KNOWN_STAT_DEVIATIONS } from './report.js'

await setGeneration(GEN) // the engine uses the same generation's type chart / rules as the reference
const sideKeys = (sc) => ({ attackerSide: sc.attSide, defenderSide: sc.defSide })

// The app's battleConditions for a scenario (mirrors App.jsx's initial state, overridden by the scenario's field).
export function battleConditionsFor(sc) {
  const f = sc.field
  return {
    weather: f.weather ?? 'none', terrain: f.terrain ?? 'none', trickRoom: false, fieldLevel: sc.level,
    magicRoom: !!f.magicRoom, wonderRoom: !!f.wonderRoom, gravity: !!f.gravity,
    yourStatus: sc.you.status ?? 'none', oppStatus: sc.opp.status ?? 'none', yourHpPercent: sc.you.hpPct ?? 100,
    yourCrit: sc.direction === 'ko' && sc.crit, oppCrit: sc.direction === 'survive' && sc.crit,
    ...Object.fromEntries(Object.entries(f).filter(([k]) => /^(your|opp)[A-Z]/.test(k)))
  }
}

export function moveFields(mv, attackerData) {
  const fake = { name: mv.slug, damage_class: { name: mv.category } }
  const offKey = offensiveStatForMove(fake, attackerData)
  const defKey = defensiveStatForMove(fake, offKey)
  const moveData = { meta: {}, effect_chance: mv.hasSecondary ? 30 : null }
  return { offKey, defKey, moveData }
}

// The goal object OpponentEditor would build for this scenario's opponent + move.
export function makeGoal(sc, youData, oppData, offKey, defKey, id = 1) {
  const mv = sc.move
  const base = (k, d) => d.stats.find(s => s.stat.name === k).base_stat
  const oppCommon = {
    id, opponentName: oppData.name, opponentLevel: sc.level, opponentAbility: sc.opp.ability, opponentItem: sc.opp.item,
    opponentNature: sc.opp.nature, opponentIvs: sc.opp.ivs, opponentEvs: sc.opp.evs, opponentSp: {}, opponentStages: sc.opp.stages,
    opponentHpPercent: sc.opp.hpPct ?? 100, opponentTypes: oppData.types.map(t => t.type.name), opponentBaseSpeed: base('speed', oppData),
    opponentWeightKg: oppData.weight / 10, opponentCanEvolve: oppData.canEvolve, opponentGenderRate: oppData.genderRate,
    opponentBaseStats: Object.fromEntries(oppData.stats.map(x => [x.stat.name, x.base_stat]))
  }
  return sc.direction === 'survive'
    ? { ...oppCommon, type: 'survive', moveName: mv.slug, moveTypeName: mv.type, movePower: mv.power, moveOffKey: offKey, moveDefKey: defKey,
        moveHasSecondary: mv.hasSecondary, opponentAttackBase: base(offKey, oppData), surviveHits: 1 }
    : { ...oppCommon, type: 'ko', koMoveName: mv.slug, koMoveTypeName: mv.type, koMovePower: mv.power, koMoveOffKey: offKey, koMoveDefKey: defKey,
        koMoveHasSecondary: mv.hasSecondary, opponentDefBase: base(defKey, oppData), opponentBaseStats: Object.fromEntries(oppData.stats.map(x => [x.stat.name, x.base_stat])), opponentHPBase: base('hp', oppData),
        opponentAtkBase: base('attack', oppData), koHits: 1 }
}

export async function runScenario(sc) {
  const youData = speciesToPokeApi(sc.you.species)
  const oppData = speciesToPokeApi(sc.opp.species)
  const attackerData = sc.direction === 'survive' ? oppData : youData
  const mv = sc.move
  const { offKey, defKey } = moveFields(mv, attackerData)
  const bc = battleConditionsFor(sc)
  const gameFormat = sc.field.gameFormat
  const base = (k, d) => d.stats.find(s => s.stat.name === k).base_stat

  const ref = referenceHit(attackerOf(sc), defenderOf(sc), sc.level, mv.slug, sc.crit, { ...sc.field, gameFormat }, ...Object.values(sideKeys(sc)))
  const goal = makeGoal(sc, youData, oppData, offKey, defKey)
  if (ref?.hitRolls) { if (sc.direction === 'survive') goal.moveHitOverride = ref.hitRolls.length; else goal.koHitOverride = ref.hitRolls.length } // same number of hits as the reference

  const ctx = {
    pokemonData: youData, userAbility: sc.you.ability, userItem: sc.you.item, userStatStages: sc.you.stages, battleConditions: bc,
    gameFormat, level: sc.level, championsMode: false, typeMultiplier: async (t, d) => staticTypeMultiplier(t, d)
  }
  const [resolved] = await resolveGoals([goal], ctx)
  const youPoints = Object.fromEntries(STAT_FULL.map(k => [k, sc.you.evs[k] ?? 0]))
  const common = { pokemonData: youData, ivs: sc.you.ivs, level: sc.level, natureName: sc.you.nature, points: youPoints, battleConditions: bc, gameFormat,
    userStatStages: sc.you.stages, userAbility: sc.you.ability, userItem: sc.you.item }

  const mine = sc.direction === 'survive'
    ? describeSurviveHit(resolved, { ...common, ownAttackPoints: youPoints.attack })
    : describeKoHit(resolved, common)
  if (!ref) return { skipped: 'reference returned a non-single-hit result' }
  // Documented deviations: the calc itself does not model these (or models them differently from the game).
  const atkSide = sc.direction === 'survive' ? sc.opp : sc.you, defSide = sc.direction === 'survive' ? sc.you : sc.opp
  if (['super-fang', 'ruination', 'final-gambit', 'fissure', 'guillotine', 'horn-drill', 'sheer-cold'].includes(sc.move.slug)) return { skipped: 'calc does not model this move' }
  if (sc.move.slug === 'natures-madness' && defSide.species === 'Shedinja') return { skipped: 'calc gives 0 at 1 HP; the game deals 1' }
  if (sc.move.slug === 'struggle' && ['protean', 'libero'].includes(atkSide.ability)) return { skipped: 'the calc gives Protean/Libero STAB on typeless Struggle; the game does not' }
  if (GEN <= 6 && sc.move.slug === 'techno-blast' && ['aerilate', 'pixilate', 'refrigerate', 'normalize'].includes(atkSide.ability)) return { skipped: 'the calc has a typo that lets -ate abilities change Techno Blast in Gens 5-6' }
  if (GEN === 3 && sc.move.slug === 'weather-ball' && (!sc.field.weather || sc.field.weather === 'none')) return { skipped: 'the calc makes Gen 3 Weather Ball Special without weather; the game keeps Normal physical' }
  if (GEN <= 2 && ['flail', 'reversal'].includes(sc.move.slug)) return { skipped: 'the calc returns one damage value (no roll) for Flail / Reversal in Gens 1-2' }
  if (GEN <= 2 && ['present', 'triple-kick', 'hidden-power', 'psywave', 'magnitude', 'bide', 'counter', 'mirror-coat'].includes(sc.move.slug)) return { skipped: 'random / typed-by-DV power: not compared in Gens 1-2' }
  if (GEN <= 4 && sc.move.slug === 'smelling-salts' && defSide.status === 'paralysis') return { skipped: 'the calc does not double Smelling Salts against paralysis before Gen 5' }
  if (GEN <= 4 && sc.move.slug === 'dream-eater' && defSide.status !== 'asleep') return { skipped: 'the calc ignores the sleep requirement' }
  if (sc.move.slug === 'natures-madness' && ref.rolls[0] === 0) return { skipped: 'calc gives 0 at 1 HP; the game deals 1' }
  if (sc.move.slug === 'natural-gift' && !(atkSide.item || '').endsWith('-berry')) return { skipped: 'no berry: the move fails in the game, the calc deals 1 BP damage' }
  if (sc.move.slug === 'hidden-power' && ['aerilate', 'pixilate', 'galvanize', 'refrigerate', 'normalize', 'dragonize'].includes(atkSide.ability)) return { skipped: 'the calc treats Hidden Power as Normal for -ate abilities; the game types it by IVs' }
  if (sc.move.slug === 'body-press' && sc.field.wonderRoom) return { skipped: 'Body Press under Wonder Room: not modeled yet (known gap)' }
  if (sc.move.slug === 'tera-starstorm' && String(atkSide.species).startsWith('Terapagos')) return { skipped: 'Terapagos Tera Shell handling differs from the calc' }
  if (sc.move.slug === 'body-press' && (atkSide.item || atkSide.ability)) return { skipped: 'calc applies Choice/ability boosts to Body Press' }
  const hp = ref.hp
  return { mine: { rolls: mine.rolls, hitRolls: mine.hitRolls, attackStat: mine.attackStat, defenseStat: mine.defenseStat, power: mine.params?.hitSpecs?.[0]?.power, hp: sc.direction === 'survive' ? mine.hpMax : mine.oppMaxHp }, ref: { rolls: ref.rolls, hitRolls: ref.hitRolls, hp }, hp }
}

// ---- Metrics for one comparison ----
const koRolls = (rolls, hp) => rolls.filter(d => d >= hp).length
const hitsToKo = (dmg, hp) => (dmg > 0 ? Math.ceil(hp / dmg) : Infinity)

export function compareHit(run) {
  const { mine, ref, hp } = run
  // Gens 5-6: the calc builds hits 2+ of a multi-hit move without crit / weather / spread / Triple Kick escalation, which the game applies, so only hit 1 is compared there.
  if (GEN < 7 && ref.hitRolls) { ref.hitRolls = [ref.hitRolls[0]]; mine.hitRolls = [mine.hitRolls[0]] }
  const hitsExact = !ref.hitRolls || (mine.hitRolls?.length === ref.hitRolls.length && ref.hitRolls.every((h, k) => h.length === ref.rolls.length && h.every((d, i) => d === mine.hitRolls[k][i])))
  const exact = mine.rolls.every((d, i) => d === ref.rolls[i]) && hitsExact
  const minDiff = mine.rolls[0] - ref.rolls[0]
  const maxDiff = mine.rolls.at(-1) - ref.rolls.at(-1)
  const diffs = mine.rolls.map((d, i) => d - ref.rolls[i])
  const rollsLow = diffs.filter(d => d < 0).length, rollsHigh = diffs.filter(d => d > 0).length
  const sumDiff = diffs.reduce((a, b) => a + b, 0)
  const worstRel = Math.max(...mine.rolls.map((d, i) => (ref.rolls[i] ? Math.abs(d - ref.rolls[i]) / ref.rolls[i] : (d ? 1 : 0))))
  const flips = {
    ohkoRolls: koRolls(mine.rolls, hp) !== koRolls(ref.rolls, hp),
    guaranteedN: hitsToKo(mine.rolls[0], hp) !== hitsToKo(ref.rolls[0], hp),
    possibleN: hitsToKo(mine.rolls.at(-1), hp) !== hitsToKo(ref.rolls.at(-1), hp)
  }
  return { exact, minDiff, maxDiff, worstRel, rollsLow, rollsHigh, sumDiff, flips, anyFlip: flips.ohkoRolls || flips.guaranteedN || flips.possibleN, hpMismatch: mine.hp !== hp }
}

// ---- Stat formula parity (independent of the damage pipeline) ----
export function statParityCheck(sc) {
  const bad = []
  for (const side of [sc.you, sc.opp]) {
    const data = speciesToPokeApi(side.species)
    const ref = buildRefPokemon(side, sc.level)
    for (const k of STAT_FULL) {
      const mine = calculateStat(k, data.stats.find(s => s.stat.name === k).base_stat, side.ivs[k], side.evs[k], sc.level, side.nature)
      const theirs = ref.rawStats[TO_SHORT[k]]
      if (mine !== theirs) bad.push({ species: side.species, stat: k, nature: side.nature, mine, theirs })
    }
  }
  return bad
}

// ---- Aggregation ----
function bump(map, key, hit) {
  const e = map.get(key) ?? { n: 0, mismatch: 0, flips: 0, low: 0, high: 0, rolls: 0, sumDiff: 0 }
  e.n++; if (!hit.exact) e.mismatch++; if (hit.anyFlip) e.flips++
  e.low += hit.rollsLow; e.high += hit.rollsHigh; e.rolls += 16; e.sumDiff += hit.sumDiff
  map.set(key, e)
}
const pct = (a, b) => (b ? +(100 * a / b).toFixed(2) : 0)

export async function runSuite(scenarios, { worstCount = 12 } = {}) {
  const tiers = { bare: { n: 0, exact: 0, flips: 0 }, single: { n: 0, exact: 0, flips: 0 }, mixed: { n: 0, exact: 0, flips: 0 } }
  const byFeature = new Map(), byMove = new Map(), byDirection = new Map(), bareMisses = []
  const hist = { min: {}, max: {} }
  const flipKinds = { ohkoRolls: 0, guaranteedN: 0, possibleN: 0 }
  let compared = 0, exact = 0, anyFlip = 0, skipped = 0, errors = 0, hpMismatch = 0, statChecked = 0
  const statBad = []
  const errorSamples = []
  const worst = []
  for (const sc of scenarios) {
    for (const b of statParityCheck(sc)) statBad.push(b)
    statChecked += 12
    let run
    try { run = await runScenario(sc) } catch (e) { errors++; if (errorSamples.length < 5) errorSamples.push({ id: sc.id, move: sc.move.slug, error: String(e?.message ?? e) }); continue }
    if (run.skipped) { skipped++; continue }
    const hit = compareHit(run)
    compared++
    if (hit.exact) exact++
    if (hit.anyFlip) anyFlip++
    if (hit.hpMismatch) hpMismatch++
    for (const k of Object.keys(flipKinds)) if (hit.flips[k]) flipKinds[k]++
    const t = tiers[sc.tier]; t.n++; if (hit.exact) t.exact++; if (hit.anyFlip) t.flips++
    hist.min[hit.minDiff] = (hist.min[hit.minDiff] ?? 0) + 1
    hist.max[hit.maxDiff] = (hist.max[hit.maxDiff] ?? 0) + 1
    if (sc.tier !== 'mixed') bump(byMove, sc.move.slug, hit)
    if (sc.tier === 'single') for (const f of sc.features) bump(byFeature, f, hit)
    bump(byDirection, sc.direction, hit)
    if (sc.tier === 'bare' && !hit.exact && bareMisses.length < 25) bareMisses.push({ id: sc.id, direction: sc.direction, move: sc.move.slug, level: sc.level, you: `${sc.you.species} ${sc.you.nature}`, opp: `${sc.opp.species} ${sc.opp.nature}`, mine: [run.mine.rolls[0], run.mine.rolls.at(-1)], ref: [run.ref.rolls[0], run.ref.rolls.at(-1)], hp: run.hp, attack: run.mine.attackStat, defense: run.mine.defenseStat })
    if (!hit.exact) {
      worst.push({ score: hit.worstRel, id: sc.id, tier: sc.tier, direction: sc.direction, move: sc.move.slug, features: sc.features,
        you: `${sc.you.species} ${sc.you.nature}`, opp: `${sc.opp.species} ${sc.opp.nature}`, level: sc.level,
        mine: [run.mine.rolls[0], run.mine.rolls.at(-1)], ref: [run.ref.rolls[0], run.ref.rolls.at(-1)], hp: run.hp })
      worst.sort((a, b) => b.score - a.score)
      if (worst.length > worstCount) worst.pop()
    }
  }
  const rank = (map, min) => [...map.entries()].filter(([, e]) => e.n >= min).map(([key, e]) => ({ key, n: e.n, mismatchPct: pct(e.mismatch, e.n), flipPct: pct(e.flips, e.n), rollsLowPct: pct(e.low, e.rolls), rollsHighPct: pct(e.high, e.rolls), meanDiff: +(e.sumDiff / Math.max(1, e.rolls)).toFixed(3) }))
    .sort((a, b) => b.mismatchPct - a.mismatchPct || b.n - a.n)
  return {
    scenarios: scenarios.length, compared, skipped, errors, errorSamples,
    statParity: { checked: statChecked, mismatches: statBad.length, samples: statBad.slice(0, 5),
      unknown: [...new Set(statBad.map(b => `${b.species}:${b.stat}`).filter(k => !KNOWN_STAT_DEVIATIONS.includes(k)))] },
    hpMismatch,
    exactPct: pct(exact, compared), anyFlipPct: pct(anyFlip, compared),
    flipKinds: Object.fromEntries(Object.entries(flipKinds).map(([k, v]) => [k, pct(v, compared)])),
    tiers: Object.fromEntries(Object.entries(tiers).map(([k, t]) => [k, { n: t.n, exactPct: pct(t.exact, t.n), flipPct: pct(t.flips, t.n) }])),
    histogram: hist,
    byFeature: rank(byFeature, 4), byMove: rank(byMove, 5).slice(0, 25), byDirection: rank(byDirection, 1), bareMisses,
    worst
  }
}
