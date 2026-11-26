// Adapters between this app's data shapes (PokeAPI-style slugs / stat names) and @smogon/calc (Showdown names).
import { Generations, Pokemon, Move, Field, calculate, toID } from '@smogon/calc'
import { slugify } from '../../src/lib/showdownparser.js'

export const GEN = Number(process.env.PARITY_GEN ?? 9) // which generation this run compares (PARITY_GEN=8 npm run parity)
export const gen = Generations.get(GEN)

export const STAT_FULL = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed']
export const TO_SHORT = { hp: 'hp', attack: 'atk', defense: 'def', 'special-attack': 'spa', 'special-defense': 'spd', speed: 'spe' }
export const toShortStats = (obj) => Object.fromEntries(STAT_FULL.filter(k => obj[k] != null).map(k => [TO_SHORT[k], obj[k]]))

// slug ("choice-band") -> Showdown display name ("Choice Band"), built from the reference's own tables.
function slugIndex(iterable) {
  const m = new Map()
  for (const x of iterable) m.set(slugify(x.name), x.name)
  return m
}
const ITEM_NAMES = slugIndex(gen.items)
const ABILITY_NAMES = slugIndex(gen.abilities)
const MOVE_NAMES = slugIndex(gen.moves)
export const itemName = (slug) => (slug ? (ITEM_NAMES.get(slug) ?? null) : '')
export const abilityName = (slug) => (slug ? (ABILITY_NAMES.get(slug) ?? null) : 'No Ability')
export const moveName = (slug) => MOVE_NAMES.get(slug) ?? null
export const hasItem = (slug) => ITEM_NAMES.has(slug)
export const hasAbility = (slug) => ABILITY_NAMES.has(slug)

// Species -> the PokeAPI-shaped object the app works with.
export function speciesToPokeApi(speciesName) {
  const s = gen.species.get(toID(speciesName))
  if (!s) throw new Error(`unknown species ${speciesName}`)
  return {
    name: slugify(s.name),
    stats: STAT_FULL.map(k => ({ stat: { name: k }, base_stat: s.baseStats[TO_SHORT[k]] })),
    types: s.types.map(t => ({ type: { name: t.toLowerCase() } })),
    weight: Math.round((s.weightkg ?? 50) * 10),
    abilities: [],
    canEvolve: !!s.nfe,
    genderRate: s.gender === 'N' ? -1 : s.gender === 'M' ? 0 : s.gender === 'F' ? 8 : 4
  }
}

const WEATHER = { sun: 'Sun', rain: 'Rain', sand: 'Sand', snow: GEN >= 9 ? 'Snow' : 'Hail', 'harsh-sunshine': 'Harsh Sunshine', 'heavy-rain': 'Heavy Rain', 'strong-winds': 'Strong Winds' }
const TERRAIN = { electric: 'Electric', grassy: 'Grassy', misty: 'Misty', psychic: 'Psychic' }
const STATUS = { burn: 'brn', paralysis: 'par', poison: 'psn', toxic: 'tox', asleep: 'slp', frozen: 'frz' }

// A scenario's `mon` / `opp` -> reference Pokemon.
export function buildRefPokemon(p, level) {
  const boosts = {}
  for (const k of ['attack', 'defense', 'special-attack', 'special-defense', 'speed']) if (p.stages?.[k]) boosts[TO_SHORT[k]] = p.stages[k]
  const mon = new Pokemon(GEN, p.species, {
    level, nature: p.nature, item: itemName(p.item) ?? '', ability: abilityName(p.ability),
    evs: toShortStats(p.evs), ivs: toShortStats(p.ivs), boosts,
    status: STATUS[p.status] ?? ''
  })
  // Current HP from the HP-bar percentage, rounded the way the app does (floor, at least 1).
  if (p.hpPct != null && p.hpPct < 100) mon.originalCurHP = Math.max(1, Math.floor(mon.maxHP() * p.hpPct / 100))
  return mon
}

// attackerSideKey / defenderSideKey = 'your' | 'opp' (which of the scenario's two sides attacks).
export function buildRefField(field, attackerSide, defenderSide) {
  const side = (prefix) => ({
    isReflect: !!field[`${prefix}Reflect`], isLightScreen: !!field[`${prefix}LightScreen`], isAuroraVeil: !!field[`${prefix}AuroraVeil`],
    isHelpingHand: !!field[`${prefix}HelpingHand`], isFriendGuard: !!field[`${prefix}FriendGuard`], isBattery: !!field[`${prefix}Battery`],
    isPowerSpot: !!field[`${prefix}PowerSpot`], isSteelySpirit: !!field[`${prefix}SteelySpirit`],
    isFlowerGift: !!field[`${prefix}FlowerGift`], isCharge: !!field[`${prefix}Charge`], isProtected: false,
    isPowerTrick: !!field[`${prefix}PowerTrick`], isForesight: !!field[`${prefix}Foresight`]
  })
  return new Field({
    gameType: field.gameFormat === 'doubles' ? 'Doubles' : 'Singles',
    weather: WEATHER[field.weather], terrain: TERRAIN[field.terrain],
    isGravity: !!field.gravity, isMagicRoom: !!field.magicRoom, isWonderRoom: !!field.wonderRoom,
    attackerSide: side(attackerSide), defenderSide: side(defenderSide)
  })
}

// Reference damage for one hit, normalised to { rolls: number[16], hp, attackerStats, defenderStats }, or null if the
// reference returned something this suite does not model (multi-hit / Parental Bond arrays).
export function referenceHit(attackerP, defenderP, level, moveSlug, isCrit, field, attackerSide, defenderSide) {
  const att = buildRefPokemon(attackerP, level)
  const def = buildRefPokemon(defenderP, level)
  const mv = new Move(GEN, moveName(moveSlug), { isCrit })
  const res = calculate(GEN, att, def, mv, buildRefField(field, attackerSide, defenderSide))
  const dmg = res.damage
  let rolls, hitRolls = null
  if (Array.isArray(dmg) && dmg.length > 1 && Array.isArray(dmg[0])) { hitRolls = dmg; rolls = dmg[0] }
  else if (typeof dmg === 'number') rolls = Array(GEN <= 2 ? 39 : 16).fill(dmg)
  else if (Array.isArray(dmg) && dmg.length && typeof dmg[0] === 'number') rolls = dmg
  else return null
  if (rolls.length !== (GEN <= 2 ? 39 : 16)) return null
  return { rolls, hitRolls, hp: def.maxHP(), attackerStats: att.stats, defenderStats: def.stats, rawDefender: def.rawStats, rawAttacker: att.rawStats }
}

export { calculate, Pokemon, Move, Field, toID }
