// Which game generation the whole app is calculating for. Gen 9 uses the live PokeAPI data (plus the built-in Gen 9 chart);
// every older generation uses a bundled data file (src/data/gen<N>.js, generated from the reference calc) for moves, species,
// type chart, items and abilities, so move power / type / category changes between games are exact and work offline.
// State lives in this module so the main thread and the optimizer worker (which loads the same data) agree.
import { setActiveTypeChart, activeTypeChart, staticTypeMultiplier } from './typeChart.js'

const loaders = {
  8: () => import('../data/gen8.js'),
  7: () => import('../data/gen7.js'),
  6: () => import('../data/gen6.js'),
  5: () => import('../data/gen5.js'),
  4: () => import('../data/gen4.js'),
  3: () => import('../data/gen3.js'),
  2: () => import('../data/gen2.js'),
  1: () => import('../data/gen1.js')
}
export const DATA_GENERATIONS = Object.keys(loaders).map(Number)

let activeNum = 9
let active = null // bundled data for activeNum (null for Gen 9)
const cache = new Map()

export const activeGeneration = () => activeNum
export const generationData = () => active

// Loads (once) and activates a generation. Resolves to the number now active.
export async function setGeneration(n) {
  if (n === 9 || !loaders[n]) { activeNum = 9; active = null; setActiveTypeChart(null); return 9 }
  if (!cache.has(n)) cache.set(n, (await loaders[n]()).default)
  active = cache.get(n)
  activeNum = n
  setActiveTypeChart(active.chart)
  return n
}

export { activeTypeChart }
export const typeMultiplierFromChart = staticTypeMultiplier

const CATEGORY_ID = { physical: 2, special: 3, status: 1 }
// PokeAPI-shaped move for this generation (null if the move does not exist there). `base` is the PokeAPI move, if any.
export function moveForGeneration(name, base = null) {
  if (!active) return base
  const row = active.moves[name]
  if (!row) return null
  const [type, power, category, secondary] = row
  return {
    ...(base ?? {}), name, type: { name: type }, power: power || null,
    damage_class: { name: category, id: CATEGORY_ID[category] },
    effect_chance: secondary ? 100 : null, meta: { ...(base?.meta ?? {}) }
  }
}

// PokeAPI-shaped Pokémon for this generation. `base` (from PokeAPI) supplies sprites and the learnset when we have it.
export function pokemonForGeneration(slug, base = null) {
  if (!active) return base
  const s = active.species[slug]
  if (!s) return null
  const STAT_NAMES = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed']
  const moves = base?.moves?.length
    ? base.moves.filter(m => active.moves[m.move.name])
    : Object.keys(active.moves).map(name => ({ move: { name } }))
  return {
    ...(base ?? { sprites: {}, id: null }),
    name: slug,
    stats: STAT_NAMES.map((n, i) => ({ stat: { name: n }, base_stat: s.b[i] })),
    types: s.t.map((t, i) => ({ slot: i + 1, type: { name: t } })),
    abilities: s.a.map((a, i) => ({ ability: { name: a }, is_hidden: false, slot: i + 1 })),
    weight: Math.round(s.w * 10), moves,
    // Known from the bundled data, so Eviolite / Rivalry need no network lookup.
    canEvolve: !!s.n, genderRate: s.g === 'N' ? -1 : s.g === 'F' ? 8 : s.g === 'M' ? 0 : 4
  }
}

export function pokemonListForGeneration() { return active ? Object.keys(active.species).map(name => ({ name })) : null }
export function itemListForGeneration() { return active ? active.items.map(name => ({ name })) : null }

// Gen 9 turned Hail into Snow, which gives Ice types x1.5 Defense; earlier generations' Hail does not.
export const snowBoostsIce = () => activeNum >= 9

// 'a' = hits every adjacent Pokémon, 'f' = every adjacent foe, '' = single target (bundled generations only; null for Gen 9).
export const moveTargetKind = (slug) => (active ? (active.moves[slug]?.[4] ?? '') : null)
// Gens 3 and 4 use the older damage code (no 4096ths chain): see legacyDamage.js.
export const isLegacyDamage = () => activeNum <= 4
