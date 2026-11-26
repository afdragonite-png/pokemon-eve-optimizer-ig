// Seeded random matchups. Every scenario is plain JSON (reproducible from a seed, easy to paste into a bug report).
import { TYPE_BOOST_ITEMS, RESIST_BERRIES, NATURES, STAT_KEYS } from '../../src/lib/pokemonMath.js'
import { slugify } from '../../src/lib/showdownparser.js'
import { gen, hasItem, hasAbility, GEN } from './reference.js'
import { EXCLUDED_MOVE_NAMES } from '../../scripts/excludedMoves.mjs'

export function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)]
const chance = (r, p) => r() < p

// ---- Moves: plain single-hit damaging moves whose power does not depend on anything outside the scenario. ----
// (Variable-power / special-handling moves are exercised by the engine's own unit tests, not by this sweep: a
// mismatch there would say more about how this harness feeds the move than about the damage formula.)
// hidden-power: the calc treats it as Normal (IV-typed in the game), so -ate abilities rewrite it there but not in the game.
const VARIABLE_POWER = new Set([
  'hidden-power',
  'acrobatics', 'assurance', 'avalanche', 'brine', 'crush-grip', 'dragon-energy', 'electro-ball', 'eruption', 'flail', 'fling',
  'grass-knot', 'gyro-ball', 'hard-press', 'heat-crash', 'heavy-slam', 'hex', 'low-kick', 'payback', 'punishment', 'return',
  'frustration', 'reversal', 'stored-power', 'power-trip', 'water-spout', 'venoshock', 'wring-out', 'weather-ball', 'terrain-pulse',
  'rising-voltage', 'expanding-force', 'psyblade', 'misty-explosion', 'collision-course', 'electro-drift', 'tera-blast',
  'tera-starstorm', 'last-respects', 'rage-fist', 'bolt-beak', 'fishious-rend', 'beat-up', 'present', 'magnitude', 'spit-up',
  'natural-gift', 'trump-card', 'round', 'echoed-voice', 'fury-cutter', 'rollout', 'ice-ball', 'pursuit', 'smelling-salts',
  'wake-up-slap', 'dream-eater', 'facade', 'foul-play', 'photon-geyser', 'body-press', 'revival-blessing', 'counter', 'mirror-coat',
  'metal-burst', 'bide', 'comeuppance', 'endeavor', 'final-gambit', 'super-fang', 'natures-madness', 'ruination', 'seismic-toss',
  'night-shade', 'dragon-rage', 'sonic-boom', 'sheer-cold', 'fissure', 'guillotine', 'horn-drill', 'knock-off', 'retaliate',
  'lash-out', 'stomping-tantrum', 'temper-flare', 'burning-jealousy', 'barb-barrage', 'infernal-parade', 'bitter-malice',
  'hydro-steam', 'gigaton-hammer', 'steel-roller', 'ice-spinner', 'poltergeist', 'upper-hand', 'sucker-punch', 'thunderclap',
  'fake-out', 'first-impression', 'belch', 'steel-beam', 'mind-blown', 'chloroblast', 'struggle', 'self-destruct', 'explosion',
  'dynamax-cannon', 'eternabeam', 'doom-desire', 'future-sight', 'focus-punch', 'solar-beam', 'solar-blade', 'last-resort',
  'crush-claw', 'psywave', 'sky-drop', 'speed-swap', 'shell-side-arm', 'raging-bull', 'raging-fury', 'triple-arrows',
  'tidy-up', 'population-bomb', 'order-up', 'hyper-drill', 'supercell-slam', 'blood-moon', 'syrup-bomb', 'malignant-chain',
  // Moves the reference special-cases in ways this sweep does not feed it (auto +1 on the charge turn, needs a shared type,
  // dual-typed, type taken from the user, ground hits Flying):
  'nihil-light', 'meteor-beam', 'electro-shot', 'synchronoise', 'revelation-dance', 'thousand-arrows', 'glaive-rush', 'scale-shot', 'surging-strikes', 'wicked-blow', 'storm-throw', 'frost-breath', 'flower-trick', 'zippy-zap'
])
// Future Sight / Doom Desire are typeless before Gen 5 (the bundled data says so too).
const moveTypeOf = (m, slug) => (GEN <= 4 && (slug === 'future-sight' || slug === 'doom-desire') ? '???' : m.type.toLowerCase())
const SPECIAL_TYPES = ['Fire', 'Water', 'Grass', 'Electric', 'Ice', 'Psychic', 'Dark', 'Dragon']
const catOf = (m) => m.category ?? (GEN < 4 ? (SPECIAL_TYPES.includes(m.type) ? 'Special' : 'Physical') : 'Status')
const MOVE_POOL = []
for (const m of gen.moves) {
  const slug = slugify(m.name)
  if (EXCLUDED_MOVE_NAMES.has(m.name)) continue
  if (!m.basePower || m.basePower < 20 || catOf(m) === 'Status') continue
  if (m.multihit || m.isMax || m.isZ || /^(max|g-max)-/.test(slug) || m.name.startsWith('Max ') || m.name.startsWith('G-Max')) continue
  if (m.overrideOffensivePokemon || m.overrideOffensiveStat || m.overrideDefensiveStat && slug !== 'psyshock') continue
  if (VARIABLE_POWER.has(slug) || m.struggleRecoil) continue
  MOVE_POOL.push({ slug, name: m.name, type: moveTypeOf(m, slug), power: m.basePower, category: catOf(m).toLowerCase(), hasSecondary: !!m.secondaries, target: m.target })
}
export const MOVE_COUNT = MOVE_POOL.length

// ---- "Everything else": every other damaging move (variable power, fixed damage, multi-hit, one-off mechanics). ----
// Which of them the engine models is exactly what a mismatch here tells us, so the only exclusions are Max / Z moves.
const SPECIAL_POOL = []
for (const m of gen.moves) {
  const slug = slugify(m.name)
  if (EXCLUDED_MOVE_NAMES.has(m.name)) continue
  if (catOf(m) === 'Status' || m.isMax || m.isZ || /^(max|g-max)-/.test(slug) || m.name.startsWith('Max ') || m.name.startsWith('G-Max')) continue
  if (MOVE_POOL.some(x => x.slug === slug)) continue
  SPECIAL_POOL.push({ slug, name: m.name, type: moveTypeOf(m, slug), power: m.basePower, category: catOf(m).toLowerCase(), hasSecondary: !!m.secondaries, target: m.target,
    multihit: m.multihit ?? null })
}
export const SPECIAL_MOVE_COUNT = SPECIAL_POOL.length
export const SPECIAL_SHARE = Number(process.env.PARITY_SPECIAL_SHARE ?? 0.35)

// ---- Species ----
const SPECIES_POOL = []
for (const s of gen.species) {
  if (!s.baseStats || /-(Gmax|Totem|Eternamax|Mega-Z|Starter|Cosplay)/.test(s.name) || s.name === 'Greninja-Bond') continue
  SPECIES_POOL.push(s.name)
}

// ---- Items / abilities exercised ----
const ATT_ITEMS_CURATED = ['choice-band', 'choice-specs', 'life-orb', 'expert-belt', 'muscle-band', 'wise-glasses', 'punching-glove', ...Object.keys(TYPE_BOOST_ITEMS)].filter(hasItem)
const DEF_ITEMS_CURATED = ['assault-vest', 'eviolite', ...Object.keys(RESIST_BERRIES)].filter(hasItem)
const ATT_ABILITIES_CURATED = ['sheer-force', 'technician', 'mega-launcher', 'iron-fist', 'tough-claws', 'strong-jaw', 'sharpness', 'reckless', 'punk-rock',
  'steelworker', 'transistor', 'dragons-maw', 'rocky-payload', 'water-bubble', 'sand-force', 'blaze', 'torrent', 'overgrow', 'swarm', 'huge-power',
  'pure-power', 'hustle', 'gorilla-tactics', 'solar-power', 'toxic-boost', 'flare-boost', 'guts', 'adaptability', 'protean', 'libero', 'aerilate',
  'pixilate', 'refrigerate', 'galvanize', 'normalize', 'sniper', 'tinted-lens', 'mold-breaker', 'teravolt', 'turboblaze', 'neuroforce', 'orichalcum-pulse',
  'hadron-engine', 'sword-of-ruin', 'beads-of-ruin', 'tablets-of-ruin', 'vessel-of-ruin'].filter(hasAbility)
const DEF_ABILITIES_CURATED = ['multiscale', 'shadow-shield', 'thick-fat', 'fluffy', 'ice-scales', 'fur-coat', 'filter', 'solid-rock', 'prism-armor', 'levitate',
  'heatproof', 'water-absorb', 'volt-absorb', 'flash-fire', 'lightning-rod', 'storm-drain', 'sap-sipper', 'earth-eater', 'dry-skin', 'unaware',
  'marvel-scale', 'purifying-salt', 'well-baked-body', 'wind-rider', 'bulletproof', 'soundproof', 'wonder-guard', 'punk-rock', 'grass-pelt',
  'sword-of-ruin', 'beads-of-ruin', 'tablets-of-ruin', 'vessel-of-ruin', 'mold-breaker'].filter(hasAbility)
// "Everything": every item and ability the reference knows, so any effect the engine forgot shows up as a mismatch.
// Half the time the curated list (items / abilities known to change damage) is used so those are not diluted.
const ALL_ITEMS = [...gen.items].map(i => slugify(i.name))
const ALL_ABILITIES = [...gen.abilities].map(a => slugify(a.name))
const anyOf = (r, curated, all) => (r() < 0.5 ? pick(r, curated) : pick(r, all))
const STATUSES = ['burn', 'paralysis', 'poison', 'toxic', 'asleep', 'frozen']
// What the field can contain depends on the generation: primal weather / Delta Stream and terrains came in Gen 6, Psychic Terrain
// and Aurora Veil in Gen 7, Battery in Gen 7, Power Spot and Steely Spirit in Gen 8.
const WEATHERS = GEN === 1 ? [] : GEN === 2 ? ['sun', 'rain'] : ['sun', 'rain', 'sand', 'snow', ...(GEN >= 6 ? ['harsh-sunshine', 'heavy-rain', 'strong-winds'] : [])]
const TERRAINS = [...(GEN >= 6 ? ['electric', 'grassy', 'misty'] : []), ...(GEN >= 7 ? ['psychic'] : [])]
const SCREENS = ['Reflect', 'LightScreen', ...(GEN >= 7 ? ['AuroraVeil'] : [])]
const ATT_SIDES = ['Charge', ...(GEN >= 4 ? ['FlowerGift', 'PowerTrick'] : []), ...(GEN >= 7 ? ['Battery'] : []), ...(GEN >= 8 ? ['PowerSpot', 'SteelySpirit'] : [])]

function randomEvs(r) {
  const choices = [0, 0, 4, 92, 100, 124, 156, 188, 252, 252, 8, 12, 36, 60, 76, 140, 172, 220, 244]
  const evs = {}
  let total = 0
  for (const k of [...STAT_KEYS].sort(() => r() - 0.5)) {
    let v = pick(r, choices)
    if (total + v > 510) v = Math.max(0, Math.floor((510 - total) / 4) * 4)
    evs[k] = v
    total += v
  }
  return evs
}
const flatIvs = () => Object.fromEntries(STAT_KEYS.map(k => [k, 31]))
// IVs: mostly 31, sometimes 0 (e.g. 0 Attack), sometimes anything.
function randomIvs(r) {
  const t = r()
  if (t < 0.5) return flatIvs()
  return Object.fromEntries(STAT_KEYS.map(k => [k, t < 0.7 ? (r() < 0.3 ? 0 : 31) : Math.floor(r() * 32)]))
}
const unifySpecial = (st) => { if (GEN === 1) st['special-defense'] = st['special-attack']; return st }
const randomStage = (r) => (r() < 0.4 ? 0 : Math.floor(r() * 13) - 6)
const zeroStages = () => ({ attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0 })

// features: which "extras" are switched on. Each is a function that mutates the scenario and returns a label.
const FEATURES = {
  'att-item': (r, sc) => { sc.attacker.item = anyOf(r, ATT_ITEMS_CURATED, ALL_ITEMS); return `att-item:${sc.attacker.item}` },
  'def-item': (r, sc) => { sc.defender.item = anyOf(r, DEF_ITEMS_CURATED, ALL_ITEMS); return `def-item:${sc.defender.item}` },
  'att-ability': (r, sc) => { sc.attacker.ability = anyOf(r, ATT_ABILITIES_CURATED, ALL_ABILITIES); return `att-ability:${sc.attacker.ability}` },
  'def-ability': (r, sc) => { sc.defender.ability = anyOf(r, DEF_ABILITIES_CURATED, ALL_ABILITIES); return `def-ability:${sc.defender.ability}` },
  weather: (r, sc) => { sc.field.weather = pick(r, WEATHERS); return `weather:${sc.field.weather}` },
  terrain: (r, sc) => { sc.field.terrain = pick(r, TERRAINS); return `terrain:${sc.field.terrain}` },
  screen: (r, sc) => { const k = pick(r, SCREENS); sc.field[`${sc.defSide}${k}`] = true; return `screen:${k}` },
  crit: (r, sc) => { sc.crit = true; return 'crit' },
  'att-boost': (r, sc) => { sc.attacker.stages.attack = randomStage(r); sc.attacker.stages['special-attack'] = randomStage(r); sc.attacker.stages.defense = randomStage(r); sc.attacker.stages['special-defense'] = randomStage(r); unifySpecial(sc.attacker.stages); return 'att-boost' },
  'def-boost': (r, sc) => { sc.defender.stages.defense = randomStage(r); sc.defender.stages['special-defense'] = randomStage(r); sc.defender.stages.attack = randomStage(r); sc.defender.stages['special-attack'] = randomStage(r); unifySpecial(sc.defender.stages); return 'def-boost' },
  burn: (r, sc) => { sc.attacker.status = 'burn'; return 'burn' },
  'att-status': (r, sc) => { sc.attacker.status = pick(r, STATUSES); return `att-status:${sc.attacker.status}` },
  'def-status': (r, sc) => { sc.defender.status = pick(r, STATUSES); return `def-status:${sc.defender.status}` },
  'att-hp': (r, sc) => { sc.attacker.hpPct = 1 + Math.floor(r() * 99); return 'att-hp' },
  'def-hp': (r, sc) => { sc.defender.hpPct = 1 + Math.floor(r() * 99); return 'def-hp' },
  'att-side': (r, sc) => { const k = pick(r, ATT_SIDES); if (k !== 'Charge' && k !== 'FlowerGift' && k !== 'PowerTrick') sc.field.gameFormat = 'doubles'; sc.field[`${sc.attSide}${k}`] = true; return `att-side:${k}` },
  'def-side': (r, sc) => { const k = pick(r, [...(GEN >= 5 ? ['FriendGuard'] : []), ...(GEN >= 4 ? ['FlowerGift', 'PowerTrick'] : []), 'Foresight']); if (k === 'FriendGuard') sc.field.gameFormat = 'doubles'; sc.field[`${sc.defSide}${k}`] = true; return `def-side:${k}` },
  doubles: (r, sc) => { sc.field.gameFormat = 'doubles'; return 'doubles' },
  'helping-hand': (r, sc) => { sc.field.gameFormat = 'doubles'; sc.field[`${sc.attSide}HelpingHand`] = true; return 'helping-hand' },
  gravity: (r, sc) => { sc.field.gravity = true; return 'gravity' },
  'magic-room': (r, sc) => { sc.field.magicRoom = true; return 'magic-room' },
  'wonder-room': (r, sc) => { sc.field.wonderRoom = true; return 'wonder-room' }
}
// Wonder Room / Magic Room arrived in Gen 5; Friend Guard in Gen 5 too (not in the field list below, handled in the feature itself).
// Gens 1-2: no abilities, no doubles, no field effects beyond Reflect / Light Screen (and Sun / Rain from Gen 2); Gen 1 has no held items.
const FEATURE_NAMES = Object.keys(FEATURES).filter(f => (f !== 'terrain' || TERRAINS.length) && (GEN >= 5 || (f !== 'wonder-room' && f !== 'magic-room')) && (GEN >= 4 || f !== 'gravity')
  && (GEN >= 3 || !['att-ability', 'def-ability', 'doubles', 'helping-hand', 'att-side', 'att-hp-never'].includes(f))
  && (GEN >= 2 || !['att-item', 'def-item', 'weather'].includes(f)) && (GEN >= 2 || f !== 'def-side'))

export function generateScenarios(count, seed = 1) {
  const r = rng(seed)
  const out = []
  for (let i = 0; i < count; i++) {
    const direction = chance(r, 0.5) ? 'survive' : 'ko'
    const mv = chance(r, SPECIAL_SHARE) ? pick(r, SPECIAL_POOL) : pick(r, MOVE_POOL)
    const level = pick(r, [50, 50, 100, 100, 5, 1 + Math.floor(r() * 100)])
    const mk = () => {
      const m = { species: pick(r, SPECIES_POOL), nature: pick(r, Object.keys(NATURES)), evs: randomEvs(r), ivs: randomIvs(r), item: '', ability: '', status: 'none', stages: zeroStages() }
      if (GEN <= 2) { m.evs['special-defense'] = m.evs['special-attack']; m.ivs['special-defense'] = m.ivs['special-attack'] } // one Special stat: DV and stat experience are shared
      return m
    }
    const you = mk(), opp = mk()
    // 'attacker' / 'defender' alias the two sides for this direction.
    const sc = {
      id: i, direction, level, move: mv, crit: false, you, opp,
      attacker: direction === 'survive' ? opp : you, defender: direction === 'survive' ? you : opp,
      attSide: direction === 'survive' ? 'opp' : 'your', defSide: direction === 'survive' ? 'your' : 'opp',
      field: { gameFormat: 'singles', weather: 'none', terrain: 'none' }, features: []
    }
    const tierRoll = r()
    sc.tier = tierRoll < 0.3 ? 'bare' : tierRoll < 0.7 ? 'single' : 'mixed'
    const n = sc.tier === 'bare' ? 0 : sc.tier === 'single' ? 1 : 2 + Math.floor(r() * 2)
    const names = [...FEATURE_NAMES].sort(() => r() - 0.5).slice(0, n)
    for (const f of names) sc.features.push(FEATURES[f](r, sc))
    // `you` / `opp` objects are shared with attacker/defender; drop the aliases for clean JSON.
    delete sc.attacker; delete sc.defender
    out.push(sc)
  }
  return out
}

export const attackerOf = (sc) => (sc.direction === 'survive' ? sc.opp : sc.you)
export const defenderOf = (sc) => (sc.direction === 'survive' ? sc.you : sc.opp)
