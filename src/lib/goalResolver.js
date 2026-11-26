import { activeGeneration } from './generation.js'
// Turns the goals the user edited into goals the optimizer can use: resolves each move's effective type / power /
// hit count / special kind (weather, abilities, Low Kick weights, ...) and the type matchup.
// This used to live inside App's Optimize click handler; it is shared now so the tests drive the exact same path.
import { resolveEffectiveMove, isGrounded, neutralizeAbilities, weatherSuppressed } from './pokemonMath.js'
import { getTypeMultiplier } from './pokeapi.js'

// Fields this module computes. App merges ONLY these back into its goal state, so edits made while type lookups were
// in flight (or a goal deleted meanwhile) are not overwritten by a stale snapshot.
export const DERIVED_KEYS = [
  'effectiveMoveTypeName', 'effectiveMovePower', 'goalTypeMultiplier', 'moveAbilityDamageMultiplier',
  'effectiveMoveSpecial', 'moveHitCount', 'moveParentalBond',
  'effectiveKoMoveTypeName', 'effectiveKoMovePower', 'koTypeMultiplier', 'koMoveAbilityDamageMultiplier',
  'effectiveKoMoveSpecial', 'koMoveHitCount', 'koMoveParentalBond'
]

export function mergeDerived(prevGoals, resolvedGoals) {
  return prevGoals.map(g => {
    const r = resolvedGoals.find(x => x.id === g.id)
    if (!r) return g
    const patch = {}
    for (const k of DERIVED_KEYS) if (k in r) patch[k] = r[k]
    return { ...g, ...patch }
  })
}

// Type matchup of ONE move against a defender, with the cases the plain chart gets wrong:
//   Flying Press = Fighting x Flying (each defender type multiplies both), Freeze-Dry is super effective on Water,
//   Gravity grounds Flying types (Ground hits them), a revealed Ghost (Foresight / Scrappy / Mind's Eye) takes Normal / Fighting,
//   Ring Target removes immunities, Iron Ball lets Ground hit Flying types.
// typeFn(moveType, defenderTypes) is the plain chart lookup (cached PokeAPI by default).
export async function moveTypeMultiplier(moveName, moveType, defenderTypes = [], typeFn = getTypeMultiplier, opts = {}) {
  const { gravity = false, ghostRevealed = false, ringTarget = false, ironBall = false,
    attackerTypes = [], targetItem = '', targetStatus = 'none', targetAbility = '', targetWeightKg = null, terrain = 'none' } = opts
  // Moves that simply fail (the calc returns 0 damage): the target must meet the move's condition.
  if (moveName === 'sky-drop' && (defenderTypes.includes('flying') || (targetWeightKg != null && targetWeightKg >= 200) || gravity)) return 0
  if (moveName === 'synchronoise' && !defenderTypes.some(t => attackerTypes.includes(t))) return 0
  if (moveName === 'dream-eater' && !(targetStatus === 'asleep' || targetAbility === 'comatose')) return 0
  if (moveName === 'steel-roller' && (!terrain || terrain === 'none')) return 0
  if (moveName === 'poltergeist' && !targetItem) return 0
  if (moveName === 'struggle' && activeGeneration() !== 1) return 1 // typeless: no resistances or immunities (Gen 1: plain Normal)
  let total = 1
  for (const t of defenderTypes) {
    let m
    if (ghostRevealed && t === 'ghost' && (moveType === 'normal' || moveType === 'fighting')) m = 1
    else if ((gravity || ironBall) && moveType === 'ground' && t === 'flying') m = 1
    else if (moveName === 'freeze-dry' && t === 'water') m = 2
    else if (moveName === 'nihil-light' && t === 'fairy') m = 1
    else {
      m = await typeFn(moveType, [t])
      if (ringTarget && m === 0) m = 1
      if (moveName === 'flying-press') {
        let f = await typeFn('flying', [t])
        if (ringTarget && f === 0) f = 1
        m *= f
      }
    }
    total *= m
  }
  if (total === 0 && moveName === 'thousand-arrows') total = 1
  return total
}

// ctx: { pokemonData, userAbility, userItem, userStatStages, battleConditions, gameFormat, level, championsMode,
//        typeMultiplier? (async (moveType, defenderTypes) => number; defaults to the cached PokeAPI lookup) }
export async function resolveGoals(goals, ctx) {
  const { pokemonData, userAbility, userItem, userStatStages, battleConditions, gameFormat, level, championsMode } = ctx
  const typeMultiplier = ctx.typeMultiplier ?? getTypeMultiplier
  const yourBaseSpeed = pokemonData.stats.find(s => s.stat.name === 'speed').base_stat
  const yourWeightKg = pokemonData.weight != null ? pokemonData.weight / 10 : null
  const userItemEff = battleConditions.magicRoom ? '' : userItem
  const yourTypes = (pokemonData.types || []).map(t => t.type.name)

  return Promise.all(goals.map(async (g) => {
    if (g.type === 'survive' && g.moveTypeName) {
      // Opponent is the attacker, so THEIR ability/status/stages/weight/speed/HP decide. (Neutralizing Gas switches either ability off first.)
      const [oppAb, youAb] = neutralizeAbilities(g.opponentAbility, battleConditions.magicRoom ? '' : g.opponentItem, userAbility, userItemEff)
      const eff = resolveEffectiveMove(g.moveName, g.moveTypeName, g.movePower, weatherSuppressed(oppAb, youAb) ? 'none' : battleConditions.weather, {
        attackerAbility: oppAb, attackerSpecies: g.opponentName, attackerTypes: g.opponentTypes ?? [],
        attackerStatus: battleConditions.oppStatus,
        attackerStages: g.opponentStages,
        targetWeightKg: yourWeightKg,
        attackerBaseSpeed: g.opponentBaseSpeed,
        targetBaseSpeed: yourBaseSpeed,
        attackerHpPercent: g.opponentHpPercent ?? 100,
        targetHpPercent: battleConditions.yourHpPercent,
        targetStatus: battleConditions.yourStatus,
        targetSwitchingOut: !!battleConditions.yourSwitchingOut,
        attackerItem: battleConditions.magicRoom ? '' : (g.opponentItem ?? ''),
        attackerWeightKg: g.opponentWeightKg,
        attackerLevel: championsMode ? 50 : (g.opponentLevel ?? 100),
        targetAbility: youAb, targetItem: userItemEff, targetStages: userStatStages,
        hitCountOverride: g.moveHitOverride ?? null,
        gameFormat, singleTarget: !!g.moveSingleTarget,
        terrain: battleConditions.terrain,
        attackerGrounded: isGrounded(g.opponentTypes ?? [], oppAb, !!battleConditions.gravity, battleConditions.magicRoom ? '' : (g.opponentItem ?? '')),
        targetGrounded: isGrounded(yourTypes, userAbility, !!battleConditions.gravity, userItemEff),
        targetDamagedThisTurn: !!g.moveCond?.damaged, movesAfterTarget: !!g.moveCond?.after,
        allyFaintedLastTurn: !!g.moveCond?.allyFainted, faintedAllies: g.moveCond?.faintedAllies ?? 0
      })
      const bcg = battleConditions
      const mult = await moveTypeMultiplier(g.moveName, eff.type, yourTypes, typeMultiplier, {
        gravity: !!bcg.gravity, ghostRevealed: !!bcg.yourForesight || oppAb === 'scrappy' || oppAb === 'minds-eye',
        ringTarget: userItemEff === 'ring-target', ironBall: userItemEff === 'iron-ball',
        attackerTypes: g.opponentTypes ?? [], targetItem: userItemEff, targetStatus: bcg.yourStatus, targetAbility: youAb, targetWeightKg: yourWeightKg, terrain: bcg.terrain })
      return { ...g, effectiveMoveTypeName: eff.type, effectiveMovePower: eff.power, goalTypeMultiplier: mult, moveAbilityDamageMultiplier: eff.abilityDamageMultiplier,
        effectiveMoveSpecial: eff.special, moveHitCount: eff.hitCount, moveParentalBond: eff.parentalBond }
    }
    if (g.type === 'ko' && g.koMoveTypeName) {
      // You're the attacker, so YOUR ability/status/stages/weight/speed/HP decide.
      const [youAbK, oppAbK] = neutralizeAbilities(userAbility, userItemEff, g.opponentAbility, battleConditions.magicRoom ? '' : g.opponentItem)
      const eff = resolveEffectiveMove(g.koMoveName, g.koMoveTypeName, g.koMovePower, weatherSuppressed(youAbK, oppAbK) ? 'none' : battleConditions.weather, {
        attackerAbility: youAbK, attackerSpecies: pokemonData.name, attackerTypes: yourTypes,
        attackerStatus: battleConditions.yourStatus,
        attackerStages: userStatStages,
        targetWeightKg: g.opponentWeightKg,
        attackerBaseSpeed: yourBaseSpeed,
        targetBaseSpeed: g.opponentBaseSpeed,
        attackerHpPercent: battleConditions.yourHpPercent,
        targetHpPercent: g.opponentHpPercent ?? 100,
        targetStatus: battleConditions.oppStatus,
        targetSwitchingOut: !!battleConditions.oppSwitchingOut,
        attackerItem: userItemEff,
        attackerWeightKg: yourWeightKg,
        attackerLevel: level,
        targetAbility: oppAbK, targetItem: battleConditions.magicRoom ? '' : (g.opponentItem ?? ''), targetStages: g.opponentStages,
        hitCountOverride: g.koHitOverride ?? null,
        gameFormat, singleTarget: !!g.koSingleTarget,
        terrain: battleConditions.terrain,
        attackerGrounded: isGrounded(yourTypes, youAbK, !!battleConditions.gravity, userItemEff),
        targetGrounded: isGrounded(g.opponentTypes ?? [], g.opponentAbility, !!battleConditions.gravity, battleConditions.magicRoom ? '' : (g.opponentItem ?? '')),
        targetDamagedThisTurn: !!g.koMoveCond?.damaged, movesAfterTarget: !!g.koMoveCond?.after,
        allyFaintedLastTurn: !!g.koMoveCond?.allyFainted, faintedAllies: g.koMoveCond?.faintedAllies ?? 0
      })
      const bcg = battleConditions, oppItemEff = bcg.magicRoom ? '' : (g.opponentItem ?? '')
      const mult = await moveTypeMultiplier(g.koMoveName, eff.type, g.opponentTypes ?? [], typeMultiplier, {
        gravity: !!bcg.gravity, ghostRevealed: !!bcg.oppForesight || youAbK === 'scrappy' || youAbK === 'minds-eye',
        ringTarget: oppItemEff === 'ring-target', ironBall: oppItemEff === 'iron-ball',
        attackerTypes: yourTypes, targetItem: oppItemEff, targetStatus: bcg.oppStatus, targetAbility: oppAbK, targetWeightKg: g.opponentWeightKg, terrain: bcg.terrain })
      return { ...g, effectiveKoMoveTypeName: eff.type, effectiveKoMovePower: eff.power, koTypeMultiplier: mult, koMoveAbilityDamageMultiplier: eff.abilityDamageMultiplier,
        effectiveKoMoveSpecial: eff.special, koMoveHitCount: eff.hitCount, koMoveParentalBond: eff.parentalBond }
    }
    return g
  }))
}

// A Protected turn nullifies the incoming / outgoing move, so don't spend points on those goals.
// (The results view still reports them as protected.)
export function goalsForOptimizer(resolvedGoals, battleConditions) {
  return resolvedGoals.filter(g =>
    !(g.type === 'survive' && battleConditions.yourProtect) && !(g.type === 'ko' && battleConditions.oppProtect))
}
