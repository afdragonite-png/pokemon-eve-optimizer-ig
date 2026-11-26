// FROZEN snapshot of the Phase 2 engine (before the Phase 4 optimizer changes). Used only to A/B the optimizer in
// tests/parity/optimizerScore.js. Do not edit; it is deliberately not kept in sync with src/lib/pokemonMath.js.
export const STAT_KEYS = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed']

export const NATURES = {
  Hardy: {}, Lonely: { plus: 'attack', minus: 'defense' }, Brave: { plus: 'attack', minus: 'speed' },
  Adamant: { plus: 'attack', minus: 'special-attack' }, Naughty: { plus: 'attack', minus: 'special-defense' },
  Bold: { plus: 'defense', minus: 'attack' }, Docile: {}, Relaxed: { plus: 'defense', minus: 'speed' },
  Impish: { plus: 'defense', minus: 'special-attack' }, Lax: { plus: 'defense', minus: 'special-defense' },
  Timid: { plus: 'speed', minus: 'attack' }, Hasty: { plus: 'speed', minus: 'defense' }, Serious: {},
  Jolly: { plus: 'speed', minus: 'special-attack' }, Naive: { plus: 'speed', minus: 'special-defense' },
  Modest: { plus: 'special-attack', minus: 'attack' }, Mild: { plus: 'special-attack', minus: 'defense' },
  Quiet: { plus: 'special-attack', minus: 'speed' }, Bashful: {}, Rash: { plus: 'special-attack', minus: 'special-defense' },
  Calm: { plus: 'special-defense', minus: 'attack' }, Gentle: { plus: 'special-defense', minus: 'defense' },
  Sassy: { plus: 'special-defense', minus: 'speed' }, Careful: { plus: 'special-defense', minus: 'special-attack' }, Quirky: {},
}

export function natureMultiplier(statKey, natureName) {
  const nature = NATURES[natureName]
  if (!nature) return 1.0
  if (nature.plus === statKey) return 1.1
  if (nature.minus === statKey) return 0.9
  return 1.0
}

export function calculateStat(statKey, base, iv, ev, level, natureName) {
  const evContribution = Math.floor(ev / 4)
  const inner = Math.floor((2 * base + iv + evContribution) * level / 100)
  if (statKey === 'hp') return inner + level + 10
  return Math.floor((inner + 5) * natureMultiplier(statKey, natureName))
}

export function totalEVs(evObject) { return Object.values(evObject).reduce((sum, v) => sum + v, 0) }
export function totalSP(spObject) { return totalEVs(spObject) }

export function roundToEVStep(value) {
  if (Number.isNaN(value)) return 0
  return Math.round(Math.max(0, Math.min(252, value)) / 4) * 4
}
export function roundToSPStep(value) {
  if (Number.isNaN(value)) return 0
  return Math.max(0, Math.min(32, Math.round(value)))
}
export function clampStage(value) {
  if (Number.isNaN(value)) return 0
  return Math.max(-6, Math.min(6, Math.round(value)))
}

export function findMinEV(statKey, base, iv, level, natureName, target) {
  for (let ev = 0; ev <= 252; ev += 4) {
    if (calculateStat(statKey, base, iv, ev, level, natureName) >= target) return ev
  }
  return null
}

// Moves whose defending stat is fixed to Defense regardless of the move's own damage class
// (Psyshock, Psystrike, Secret Sword: special-category moves that are defended against with Defense).
export const DEF_OVERRIDE_MOVES = new Set(['psyshock', 'psystrike', 'secret-sword'])
// Photon Geyser: damages with whichever of the user's Attack/Sp. Atk is higher, and the target's
// matching defensive stat (Defense vs Special Defense) follows that same choice. Approximated off
// BASE stats (see the Gyro Ball/Electro Ball note below) since final EVs aren't known yet when this
// choice has to be made.
export const PHOTON_GEYSER_MOVES = new Set(['photon-geyser'])

export function offensiveStatForMove(moveData, attackerData) {
  if (!moveData?.damage_class) return null
  const moveName = moveData.name
  if (moveName === 'body-press') return 'defense' // attacks with the user's Defense stat
  if (PHOTON_GEYSER_MOVES.has(moveName) && attackerData) {
    const atk = attackerData.stats.find(s => s.stat.name === 'attack')?.base_stat ?? 0
    const spa = attackerData.stats.find(s => s.stat.name === 'special-attack')?.base_stat ?? 0
    return spa > atk ? 'special-attack' : 'attack'
  }
  if (moveData.damage_class.name === 'physical') return 'attack'
  if (moveData.damage_class.name === 'special') return 'special-attack'
  return null
}
// offKeyOverride: the offensive stat actually chosen for this move (from offensiveStatForMove).
// Needed so Photon Geyser's defending stat tracks whichever offensive stat got picked.
export function defensiveStatForMove(moveData, offKeyOverride) {
  if (!moveData?.damage_class) return null
  const moveName = moveData.name
  if (DEF_OVERRIDE_MOVES.has(moveName)) return 'defense'
  if (PHOTON_GEYSER_MOVES.has(moveName) && offKeyOverride) {
    return offKeyOverride === 'attack' ? 'defense' : 'special-defense'
  }
  if (moveData.damage_class.name === 'physical') return 'defense'
  if (moveData.damage_class.name === 'special') return 'special-defense'
  return null
}

export async function getTypeMultiplier(moveTypeName, defenderTypeNames) {
  if (!moveTypeName) return 1
  const res = await fetch(`https://pokeapi.co/api/v2/type/${moveTypeName}`)
  const data = await res.json()
  const rel = data.damage_relations
  let m = 1
  for (const t of defenderTypeNames) {
    if (rel.double_damage_to.some(x => x.name === t)) m *= 2
    if (rel.half_damage_to.some(x => x.name === t)) m *= 0.5
    if (rel.no_damage_to.some(x => x.name === t)) m *= 0
  }
  return m
}

export function statStageMultiplier(stage) {
  const s = clampStage(stage)
  return s >= 0 ? (2 + s) / 2 : 2 / (2 - s)
}
export function applyStage(stat, stage) { return Math.floor(stat * statStageMultiplier(stage)) }

// ============ STATUS CONDITIONS ============
export const STATUS_CONDITIONS = ['none', 'burn', 'paralysis', 'poison', 'toxic', 'asleep', 'frozen']
export function hasMajorStatus(status) { return !!status && status !== 'none' }
// Facade only doubles for burn/paralysis/poison/toxic — NOT sleep or freeze.
export function facadeEligibleStatus(status) {
  return status === 'burn' || status === 'paralysis' || status === 'poison' || status === 'toxic'
}
// Burn halves damage dealt by PHYSICAL moves, unless the attacker has Guts (which negates the halving).
export function burnDamageMultiplier(attackerStatus, isPhysical, attackerAbility) {
  return (attackerStatus === 'burn' && isPhysical && attackerAbility !== 'guts') ? 0.5 : 1
}
// Paralysis halves Speed, unless the holder has Quick Feet (which negates the drop instead of boosting further here).
export function statusParalysisSpeedMultiplier(status, ability) {
  return (status === 'paralysis' && ability !== 'quick-feet') ? 0.5 : 1
}
export function facadePowerMultiplier(moveName, attackerStatus) {
  return (moveName === 'facade' && facadeEligibleStatus(attackerStatus)) ? 2 : 1
}

// ============ ITEMS ============
export const TYPE_BOOST_ITEMS = {
  'charcoal': 'fire', 'mystic-water': 'water', 'magnet': 'electric', 'miracle-seed': 'grass',
  'never-melt-ice': 'ice', 'black-belt': 'fighting', 'poison-barb': 'poison', 'soft-sand': 'ground',
  'sharp-beak': 'flying', 'twisted-spoon': 'psychic', 'silver-powder': 'bug', 'hard-stone': 'rock',
  'spell-tag': 'ghost', 'dragon-fang': 'dragon', 'black-glasses': 'dark', 'metal-coat': 'steel',
  'pixie-plate': 'fairy', 'silk-scarf': 'normal',
  'flame-plate': 'fire', 'splash-plate': 'water', 'zap-plate': 'electric', 'meadow-plate': 'grass',
  'icicle-plate': 'ice', 'fist-plate': 'fighting', 'toxic-plate': 'poison', 'earth-plate': 'ground',
  'sky-plate': 'flying', 'mind-plate': 'psychic', 'insect-plate': 'bug', 'stone-plate': 'rock',
  'spooky-plate': 'ghost', 'draco-plate': 'dragon', 'dread-plate': 'dark', 'iron-plate': 'steel',
  'sea-incense': 'water', 'wave-incense': 'water', 'odd-incense': 'psychic', 'rock-incense': 'rock',
  'rose-incense': 'grass', 'fairy-feather': 'fairy'
}
// Dual-type-boost items (signature orbs / Soul Dew) — boost EITHER of their two associated types by 1.2x.
// Simplification: not species-gated (consistent with how TYPE_BOOST_ITEMS above also isn't species-gated).
export const DUAL_TYPE_BOOST_ITEMS = {
  'adamant-orb': ['dragon', 'steel'],
  'lustrous-orb': ['water', 'dragon'],
  'griseous-orb': ['dragon', 'ghost'],
  'soul-dew': ['dragon', 'psychic']
}
export const RESIST_BERRIES = {
  'occa-berry': 'fire', 'passho-berry': 'water', 'wacan-berry': 'electric', 'rindo-berry': 'grass',
  'yache-berry': 'ice', 'chople-berry': 'fighting', 'kebia-berry': 'poison', 'shuca-berry': 'ground',
  'coba-berry': 'flying', 'payapa-berry': 'psychic', 'tanga-berry': 'bug', 'charti-berry': 'rock',
  'kasib-berry': 'ghost', 'haban-berry': 'dragon', 'colbur-berry': 'dark', 'babiri-berry': 'steel',
  'roseli-berry': 'fairy', 'chilan-berry': 'normal'
}
export const MEGA_STONES = {
  'venusaur-mega': 'venusaurite', 'charizard-mega-x': 'charizardite-x', 'charizard-mega-y': 'charizardite-y',
  'blastoise-mega': 'blastoisinite', 'beedrill-mega': 'beedrillite', 'pidgeot-mega': 'pidgeotite',
  'alakazam-mega': 'alakazite', 'slowbro-mega': 'slowbronite', 'gengar-mega': 'gengarite',
  'kangaskhan-mega': 'kangaskhanite', 'pinsir-mega': 'pinsirite', 'gyarados-mega': 'gyaradosite',
  'aerodactyl-mega': 'aerodactylite', 'mewtwo-mega-x': 'mewtwonite-x', 'mewtwo-mega-y': 'mewtwonite-y',
  'ampharos-mega': 'ampharosite', 'steelix-mega': 'steelixite', 'scizor-mega': 'scizorite',
  'heracross-mega': 'heracronite', 'houndoom-mega': 'houndoominite', 'tyranitar-mega': 'tyranitarite',
  'blaziken-mega': 'blazikenite', 'gardevoir-mega': 'gardevoirite', 'mawile-mega': 'mawilite',
  'aggron-mega': 'aggronite', 'medicham-mega': 'medichamite', 'manectric-mega': 'manectite',
  'banette-mega': 'banettite', 'absol-mega': 'absolite', 'garchomp-mega': 'garchompite',
  'lucario-mega': 'lucarionite', 'abomasnow-mega': 'abomasite', 'latias-mega': 'latiasite',
  'latios-mega': 'latiosite', 'swampert-mega': 'swampertite', 'sceptile-mega': 'sceptilite',
  'sableye-mega': 'sablenite', 'altaria-mega': 'altarianite', 'gallade-mega': 'galladite',
  'audino-mega': 'audinite', 'sharpedo-mega': 'sharpedonite', 'glalie-mega': 'glalitite',
  'diancie-mega': 'diancite', 'metagross-mega': 'metagrossite', 'camerupt-mega': 'cameruptite',
  'lopunny-mega': 'lopunnite', 'salamence-mega': 'salamencite', 'groudon-primal': 'red-orb', 'kyogre-primal': 'blue-orb'
}
export function berryResistMultiplier(itemName, moveTypeName, typeMultiplier, holderAbility = '') {
  if (RESIST_BERRIES[itemName] !== moveTypeName) return 1
  const m = holderAbility === 'ripen' ? 0.25 : 0.5 // Ripen doubles a berry's effect
  if (itemName === 'chilan-berry') return m // Chilan halves Normal hits even when not super effective
  return typeMultiplier >= 2 ? m : 1
}

// ---- Stat changes the HOLDER gets from being hit (Kee / Maranga / Stamina / Weak Armor ...) and from
// low-HP berries (Ganlon / Apicot). Only the stat that the incoming move is calculated against matters,
// so only effects on `defKey` are returned. The damage simulation applies them hit by hit, which also
// makes later hits of a multi-hit move (and later turns of a 2HKO) use the boosted stat.
// `fraction` (low-HP berries) is a share of MAX HP, resolved against the real max HP at simulation time.
export function defenderOnHitEffects({ item, ability, moveTypeName, isPhysicalCat, defKey }) {
  const out = []
  const ripen = ability === 'ripen' ? 2 : 1
  const flip = ability === 'contrary' ? -1 : ability === 'simple' ? 2 : 1
  const add = (stat, stages, extra) => { if (stat === defKey) out.push({ stages: stages * flip, ...extra }) }
  if (item === 'kee-berry' && isPhysicalCat) add('defense', ripen, { once: true, trigger: 'hit' })
  if (item === 'maranga-berry' && !isPhysicalCat) add('special-defense', ripen, { once: true, trigger: 'hit' })
  if (item === 'luminous-moss' && moveTypeName === 'water') add('special-defense', 1, { once: true, trigger: 'hit' })
  if (item === 'ganlon-berry') add('defense', ripen, { once: true, trigger: 'lowHp', fraction: ability === 'gluttony' ? 0.5 : 0.25 })
  if (item === 'apicot-berry') add('special-defense', ripen, { once: true, trigger: 'lowHp', fraction: ability === 'gluttony' ? 0.5 : 0.25 })
  if (ability === 'stamina') add('defense', 1, { once: false, trigger: 'hit' })
  if (ability === 'weak-armor' && isPhysicalCat) add('defense', -1, { once: false, trigger: 'hit' })
  if (ability === 'water-compaction' && moveTypeName === 'water') add('defense', 2, { once: false, trigger: 'hit' })
  return out
}

// ---- Sustain items: only matter across multi-hit KO / survive goals (one hit per turn). ----
// Heal 1/3 max HP once HP <= 1/4 (1/2 with Gluttony). Sitrus heals 1/4 max HP once HP <= 1/2.
export const THIRD_HP_BERRIES = new Set(['figy-berry', 'wiki-berry', 'mago-berry', 'aguav-berry', 'iapapa-berry'])
// Returns { berry: { threshold, heal } | null, turnEnd } where turnEnd is HP gained (+) or lost (-) at end of each turn.
export function sustainProfile(itemName, ability, types, maxHp) {
  const profile = { berry: null, turnEnd: 0 }
  if (!itemName) return profile
  const half = Math.floor(maxHp / 2), quarter = Math.floor(maxHp / 4)
  if (itemName === 'leftovers') profile.turnEnd = Math.max(1, Math.floor(maxHp / 16))
  else if (itemName === 'black-sludge') {
    profile.turnEnd = (types || []).includes('poison')
      ? Math.max(1, Math.floor(maxHp / 16))
      : -Math.max(1, Math.floor(maxHp / 8))
  }
  else if (itemName === 'sitrus-berry') profile.berry = { threshold: half, heal: quarter }
  else if (THIRD_HP_BERRIES.has(itemName)) profile.berry = { threshold: ability === 'gluttony' ? half : quarter, heal: Math.floor(maxHp / 3) }
  return profile
}
export function itemSpriteUrl(itemName) {
  return itemName ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${itemName}.png` : null
}
// Items that change the attacker's Attack / Sp. Atk STAT itself (Choice Band / Specs and the species items).
// Life Orb is a final-damage modifier and Muscle Band / Wise Glasses / type items change BASE POWER, so those
// live in attackerFinalMultiplier() and basePowerModifiers() — applying them to the stat rounds differently.
export function offenseItemMultiplier(itemName, offKey, moveTypeName, speciesName = '') {
  let m = 1
  if (itemName === 'choice-band' && offKey === 'attack') m *= 1.5
  if (itemName === 'choice-specs' && offKey === 'special-attack') m *= 1.5
  const sp = String(speciesName || '').toLowerCase()
  if (itemName === 'light-ball' && sp.startsWith('pikachu') && (offKey === 'attack' || offKey === 'special-attack')) m *= 2
  if (itemName === 'thick-club' && (sp.startsWith('cubone') || sp.startsWith('marowak')) && offKey === 'attack') m *= 2
  if (itemName === 'deep-sea-tooth' && sp.startsWith('clamperl') && offKey === 'special-attack') m *= 2
  return m
}
// Life Orb is x5324/4096 on the final damage. (Expert Belt is handled by expertBeltMultiplier.)
export function attackerFinalMultiplier(ability, itemName, typeMultiplier) {
  let m = 1
  if (itemName === 'life-orb') m *= 5324 / 4096
  if (ability === 'neuroforce' && typeMultiplier >= 2) m *= 1.25
  return m
}
// Eviolite only works on a Pokémon that can still evolve. `canEvolve` is true / false once known and null / undefined
// while it isn't (data not loaded yet) — unknown is treated as "can evolve" so the boost isn't silently dropped.
export function defenseItemMultiplier(itemName, defKey, canEvolve = true) {
  let m = 1
  if (itemName === 'assault-vest' && defKey === 'special-defense') m *= 1.5
  if (itemName === 'eviolite' && canEvolve !== false) m *= 1.5
  return m
}
export function defenseAsOffenseMultiplier(offKey, itemName, weather, holderTypes, canEvolve = true) {
  if (offKey !== 'defense') return 1
  return defenseItemMultiplier(itemName, 'defense', canEvolve) * weatherStatBoost(weather, holderTypes || [], 'defense')
}

// Can this Pokémon still evolve? (For Eviolite.) Walks PokeAPI's evolution chain from the species. Resolves to
// true / false, or null when it can't be determined (network error, no chain data). Definite answers are cached.
const canEvolveCache = new Map()
export async function fetchCanEvolve(pokemonData) {
  const url = pokemonData?.species?.url
  if (!url) return null
  if (canEvolveCache.has(url)) return canEvolveCache.get(url)
  try {
    const sp = await (await fetch(url)).json()
    const chainUrl = sp?.evolution_chain?.url
    if (!chainUrl) return null
    const root = (await (await fetch(chainUrl)).json())?.chain
    const find = (node) => !node ? null : (node.species?.name === sp.name ? node : (node.evolves_to || []).map(find).find(Boolean) ?? null)
    const node = find(root)
    if (!node) return null
    const result = (node.evolves_to || []).length > 0
    canEvolveCache.set(url, result)
    return result
  } catch { return null }
}
const POWER_ITEMS = new Set(['macho-brace', 'power-weight', 'power-bracer', 'power-belt', 'power-lens', 'power-band', 'power-anklet'])
export function speedItemMultiplier(itemName) {
  if (itemName === 'choice-scarf') return 1.5
  if (itemName === 'iron-ball' || POWER_ITEMS.has(itemName)) return 0.5
  return 1
}
// Collision Course / Electro Drift: x5461/4096 (~1.33) on a super effective hit.
export function superEffectiveMoveMultiplier(moveName, typeMultiplier) {
  return ((moveName === 'collision-course' || moveName === 'electro-drift') && typeMultiplier >= 2) ? 5461 / 4096 : 1
}
// Sheer Force applies to damaging moves that have a chance of a secondary effect (PokeAPI move data).
export function hasSecondaryEffect(moveData) {
  if (!moveData) return false
  const m = moveData.meta ?? {}
  return moveData.effect_chance != null || (m.flinch_chance ?? 0) > 0 || (m.ailment_chance ?? 0) > 0
}
export function expertBeltMultiplier(itemName, typeMultiplier) {
  return (itemName === 'expert-belt' && typeMultiplier >= 2) ? 1.2 : 1
}
export function bootsIgnoreHazards(itemName) { return itemName === 'heavy-duty-boots' }
// Knock Off: 1.5x power if the target holds a removable item. Sticky Hold and a handful of
// "can't be knocked off" held items (mega stones/primal orbs on the matching species) are exempted.
export function knockOffBoostMultiplier(moveName, defenderItem, defenderAbility) {
  if (moveName !== 'knock-off') return 1
  if (!defenderItem) return 1
  if (defenderAbility === 'sticky-hold') return 1
  const nonRemovable = new Set(Object.values(MEGA_STONES))
  if (nonRemovable.has(defenderItem)) return 1
  return 1.5
}

export const PULSE_MOVES = new Set(['water-pulse', 'dragon-pulse', 'aura-sphere', 'dark-pulse', 'heal-pulse', 'terrain-pulse', 'origin-pulse'])
// effectivePower: the move's power AFTER other power-resolving steps (weather ball, ability type
// change boost, Stored Power/Low Kick/Gyro Ball/etc., Facade) — Technician checks the power at that point.
// (Technician / Mega Launcher / Iron Fist ... now live in basePowerModifiers(), which chains every base-power
// modifier the way the game does. Kept as a no-op so older imports don't break.)
export function abilityMovePowerMultiplier() { return 1 }

// ---- Move groups used by abilities ----
const PUNCH_MOVES = new Set(['bullet-punch', 'comet-punch', 'dizzy-punch', 'drain-punch', 'dynamic-punch', 'fire-punch', 'focus-punch',
  'hammer-arm', 'ice-hammer', 'ice-punch', 'jet-punch', 'mach-punch', 'mega-punch', 'meteor-mash', 'plasma-fists', 'power-up-punch',
  'rage-fist', 'shadow-punch', 'sky-uppercut', 'surging-strikes', 'thunder-punch', 'wicked-blow', 'double-iron-bash'])
const BITE_MOVES = new Set(['bite', 'crunch', 'fire-fang', 'ice-fang', 'thunder-fang', 'poison-fang', 'psychic-fangs', 'hyper-fang', 'jaw-lock', 'fishious-rend'])
const SLICE_MOVES = new Set(['aerial-ace', 'air-cutter', 'air-slash', 'aqua-cutter', 'behemoth-blade', 'bitter-blade', 'ceaseless-edge', 'cross-poison',
  'cut', 'fury-cutter', 'kowtow-cleave', 'leaf-blade', 'mighty-cleave', 'night-slash', 'population-bomb', 'psyblade', 'psycho-cut', 'razor-leaf', 'razor-shell',
  'sacred-sword', 'secret-sword', 'slash', 'solar-blade', 'stone-axe', 'tachyon-cutter', 'x-scissor'])
const RECOIL_MOVES = new Set(['brave-bird', 'double-edge', 'flare-blitz', 'head-smash', 'high-jump-kick', 'jump-kick', 'submission', 'take-down',
  'volt-tackle', 'wave-crash', 'wood-hammer', 'head-charge', 'wild-charge', 'light-of-ruin', 'chloroblast', 'supercell-slam', 'struggle'])
// Physical moves that do NOT make contact (everything else physical is treated as contact: Tough Claws / Fluffy).
const NON_CONTACT_PHYSICAL = new Set(['earthquake', 'rock-slide', 'rock-blast', 'rock-throw', 'rock-tomb', 'stone-edge', 'bullet-seed', 'seed-bomb',
  'icicle-spear', 'icicle-crash', 'pin-missile', 'spike-cannon', 'barrage', 'explosion', 'self-destruct', 'misty-explosion', 'bulldoze', 'magnitude',
  'fissure', 'gunk-shot', 'poison-sting', 'twineedle', 'dragon-darts', 'bonemerang', 'bone-club', 'bone-rush', 'psycho-cut', 'thousand-arrows',
  'thousand-waves', 'precipice-blades', 'diamond-storm', 'poltergeist', 'fusion-bolt', 'hyperspace-fury', 'barb-barrage', 'ice-shard', 'water-shuriken',
  'razor-leaf', 'shadow-bone', 'smack-down', 'sky-attack', 'meteor-assault',
  'lands-wrath', 'mountain-gale', 'ivy-cudgel', 'triple-arrows', 'spirit-shackle', 'shell-side-arm',
  'fling', 'beat-up'])
export function isContactMove(moveName, isPhysicalCat) { return !!isPhysicalCat && !NON_CONTACT_PHYSICAL.has(moveName) }

// ---- Mold Breaker & friends ----
export const MOLD_BREAKER_ABILITIES = new Set(['mold-breaker', 'teravolt', 'turboblaze'])
export const ABILITY_IGNORING_MOVES = new Set(['sunsteel-strike', 'moongeist-beam', 'photon-geyser', 'light-that-burns-the-sky',
  'menacing-moonraze-maelstrom', 'searing-sunraze-smash', 'g-max-drum-solo', 'g-max-fire-ball', 'g-max-hydrosnipe'])
const UNBREAKABLE_DEFENDER_ABILITIES = new Set(['prism-armor', 'shadow-shield', 'full-metal-body', 'neuroforce'])
// The defender's ability as the attack sees it: switched off by Mold Breaker / Teravolt / Turboblaze or an
// ability-ignoring move (Sunsteel Strike, Moongeist Beam, Photon Geyser ...), except for the unbreakable ones.
export function effectiveDefenderAbility(attackerAbility, moveName, defenderAbility) {
  if (!defenderAbility) return defenderAbility || ''
  if (UNBREAKABLE_DEFENDER_ABILITIES.has(defenderAbility)) return defenderAbility
  if (MOLD_BREAKER_ABILITIES.has(attackerAbility) || ABILITY_IGNORING_MOVES.has(moveName)) return ''
  return defenderAbility
}

// ---- Base-power chain (all in 4096ths, chained like the game: c = (c * m + 2048) >> 12) ----
export function chainMods(list) {
  let c = 4096
  for (const m of list) if (m !== 4096) c = Math.floor((c * m + 2048) / 4096)
  return c
}
export function modifyPower(power, chain) {
  if (!power || chain === 4096) return power
  return Math.max(1, Math.floor((Math.floor(power * chain) + 2047) / 4096))
}
// Every modifier to the move's BASE POWER from the attacker's ability and item.
export function basePowerModifiers({ ability, item, moveName, moveTypeName, isPhysicalCat, effectivePower, weather, hpPercent = 100, hasSecondary = false }) {
  const m = []
  if (ability === 'sheer-force' && hasSecondary) m.push(5325)
  if (ability === 'technician' && effectivePower != null && effectivePower <= 60) m.push(6144)
  if (ability === 'mega-launcher' && PULSE_MOVES.has(moveName)) m.push(6144)
  if (ability === 'iron-fist' && PUNCH_MOVES.has(moveName)) m.push(4915)
  if (ability === 'tough-claws' && isContactMove(moveName, isPhysicalCat)) m.push(5325)
  if (ability === 'strong-jaw' && BITE_MOVES.has(moveName)) m.push(6144)
  if (ability === 'sharpness' && SLICE_MOVES.has(moveName)) m.push(6144)
  if (ability === 'reckless' && RECOIL_MOVES.has(moveName)) m.push(4915)
  if (ability === 'punk-rock' && SOUND_MOVES.has(moveName)) m.push(5325)
  if (ability === 'steelworker' && moveTypeName === 'steel') m.push(6144)
  if (ability === 'transistor' && moveTypeName === 'electric') m.push(5325)
  if (ability === 'dragons-maw' && moveTypeName === 'dragon') m.push(6144)
  if (ability === 'rocky-payload' && moveTypeName === 'rock') m.push(6144)
  if (ability === 'water-bubble' && moveTypeName === 'water') m.push(8192)
  if (ability === 'sand-force' && weather === 'sand' && (moveTypeName === 'rock' || moveTypeName === 'ground' || moveTypeName === 'steel')) m.push(5325)
  // Blaze / Torrent / Overgrow / Swarm: x1.5 for their type at 1/3 HP or less.
  if (hpPercent <= 33.4) {
    if ((ability === 'blaze' && moveTypeName === 'fire') || (ability === 'torrent' && moveTypeName === 'water')
      || (ability === 'overgrow' && moveTypeName === 'grass') || (ability === 'swarm' && moveTypeName === 'bug')) m.push(6144)
  }
  if (item === 'punching-glove' && PUNCH_MOVES.has(moveName)) m.push(4506)
  if (item === 'muscle-band' && isPhysicalCat) m.push(4505)
  if (item === 'wise-glasses' && !isPhysicalCat) m.push(4505)
  if (TYPE_BOOST_ITEMS[item] === moveTypeName) m.push(4915)
  if ((DUAL_TYPE_BOOST_ITEMS[item] || []).includes(moveTypeName)) m.push(4915)
  return chainMods(m)
}
function scaleHitSpecPowers(specs, chain) {
  if (!specs || chain === 4096) return specs
  return specs.map(s => ({ ...s, power: modifyPower(s.power, chain) }))
}

export function abilityStatMultiplier(ability, statKey, weather, status, terrain = 'none') {
  let m = 1
  if ((ability === 'huge-power' || ability === 'pure-power') && statKey === 'attack') m *= 2
  if (ability === 'hustle' && statKey === 'attack') m *= 1.5
  if (ability === 'gorilla-tactics' && statKey === 'attack') m *= 1.5
  if (ability === 'solar-power' && statKey === 'special-attack' && weather === 'sun') m *= 1.5
  if (ability === 'toxic-boost' && statKey === 'attack' && (status === 'poison' || status === 'toxic')) m *= 1.5
  if (ability === 'flare-boost' && statKey === 'special-attack' && status === 'burn') m *= 1.5
  if (ability === 'orichalcum-pulse' && statKey === 'attack' && (weather === 'sun' || weather === 'harsh-sunshine')) m *= 5461 / 4096
  if (ability === 'hadron-engine' && statKey === 'special-attack' && terrain === 'electric') m *= 5461 / 4096
  if (ability === 'swift-swim' && statKey === 'speed' && (weather === 'rain' || weather === 'heavy-rain')) m *= 2
  if (ability === 'chlorophyll' && statKey === 'speed' && (weather === 'sun' || weather === 'harsh-sunshine')) m *= 2
  if (ability === 'sand-rush' && statKey === 'speed' && weather === 'sand') m *= 2
  if (ability === 'slush-rush' && statKey === 'speed' && weather === 'snow') m *= 2
  if (ability === 'surge-surfer' && statKey === 'speed' && terrain === 'electric') m *= 2
  if (ability === 'guts' && statKey === 'attack' && hasMajorStatus(status)) m *= 1.5
  if (ability === 'quick-feet' && statKey === 'speed' && hasMajorStatus(status)) m *= 1.5
  return m
}
// Ruin abilities weaken the matching stat of every OTHER Pokémon on the field by 25%.
export function ruinStatMultiplier(statKey, holderAbility, otherAbility) {
  const ruin = { 'attack': 'tablets-of-ruin', 'special-attack': 'vessel-of-ruin', 'defense': 'sword-of-ruin', 'special-defense': 'beads-of-ruin' }[statKey]
  return (ruin && otherAbility === ruin && holderAbility !== ruin) ? 0.75 : 1
}
// Multiplier on the defender's Defense / Sp. Def STAT (item, weather, abilities, status, Ruin).
export function defenderStatMultiplier({ defKey, item, ability, types, weather, terrain, status, flowerGift, attackerAbility, canEvolve = true }) {
  let m = defenseItemMultiplier(item, defKey, canEvolve) *weatherStatBoost(weather, types || [], defKey) * flowerGiftMultiplier(flowerGift, weather, defKey)
  if (defKey === 'defense') {
    if (ability === 'fur-coat') m *= 2
    if (ability === 'marvel-scale' && hasMajorStatus(status)) m *= 1.5
    if (ability === 'grass-pelt' && terrain === 'grassy') m *= 1.5
  }
  m *= ruinStatMultiplier(defKey, ability, attackerAbility)
  return m
}
// ctx: { isPhysicalCat, isContact, isSound }. Multiscale / Shadow Shield are NOT here — they only work on the
// first hit at full HP, so they are applied through the simulation's first-hit multiplier (firstHitDefenderMultiplier).
export function abilityDamageTakenMultiplier(ability, moveTypeName, typeMultiplier, ctx = {}) {
  const { isPhysicalCat = false, isContact = false, isSound = false } = ctx
  let m = 1
  if (ability === 'thick-fat' && (moveTypeName === 'fire' || moveTypeName === 'ice')) m *= 0.5
  if (ability === 'heatproof' && moveTypeName === 'fire') m *= 0.5
  if (ability === 'water-bubble' && moveTypeName === 'fire') m *= 0.5
  if (ability === 'purifying-salt' && moveTypeName === 'ghost') m *= 0.5
  if (ability === 'dry-skin' && moveTypeName === 'fire') m *= 1.25
  if (ability === 'fluffy') { if (isContact) m *= 0.5; if (moveTypeName === 'fire') m *= 2 }
  if (ability === 'ice-scales' && !isPhysicalCat) m *= 0.5
  if (ability === 'punk-rock' && isSound) m *= 0.5
  if (ability === 'flash-fire' && moveTypeName === 'fire') m *= 0
  if (ability === 'well-baked-body' && moveTypeName === 'fire') m *= 0
  if ((ability === 'volt-absorb' || ability === 'lightning-rod' || ability === 'motor-drive') && moveTypeName === 'electric') m *= 0
  if ((ability === 'water-absorb' || ability === 'storm-drain' || ability === 'dry-skin') && moveTypeName === 'water') m *= 0
  if (ability === 'sap-sipper' && moveTypeName === 'grass') m *= 0
  if (ability === 'earth-eater' && moveTypeName === 'ground') m *= 0
  if (ability === 'wonder-guard' && typeMultiplier < 2) m *= 0
  if ((ability === 'filter' || ability === 'solid-rock' || ability === 'prism-armor') && typeMultiplier >= 2) m *= 0.75
  return m
}
// Multiscale / Shadow Shield: halve the FIRST hit, and only while the holder is at full HP.
export function firstHitDefenderMultiplier(ability, atFullHp) {
  return (atFullHp && (ability === 'multiscale' || ability === 'shadow-shield')) ? 0.5 : 1
}
export function abilityDamageDealtMultiplier(ability, typeMultiplier) {
  return ability === 'tinted-lens' && typeMultiplier < 1 ? 2 : 1
}
export function abilityStabMultiplier(ability) { return ability === 'adaptability' ? 2 : 1.5 }
// Protean / Libero turn the user into the move's type, so every move gets STAB.
export function hasUniversalStab(ability) { return ability === 'protean' || ability === 'libero' }

// Fairy Aura / Dark Aura boost every Fairy / Dark move on the field by ~1.33x (5448/4096), no matter which
// side holds the ability. Aura Break on either side flips that into a 0.75x drop (3072/4096).
export function auraMultiplier(moveTypeName, attackerAbility, defenderAbility) {
  const abilities = [attackerAbility, defenderAbility]
  const active = (moveTypeName === 'fairy' && abilities.includes('fairy-aura'))
    || (moveTypeName === 'dark' && abilities.includes('dark-aura'))
  if (!active) return 1
  return abilities.includes('aura-break') ? 3072 / 4096 : 5448 / 4096
}

// Gravity and Iron Ball both negate Levitate's Ground immunity, and both ground fliers.
export function abilityBlocksMoveType(ability, moveTypeName, gravityActive, itemName) {
  if (gravityActive || itemName === 'iron-ball') return false
  if (itemName === 'air-balloon' && moveTypeName === 'ground') return true
  return ability === 'levitate' && moveTypeName === 'ground'
}
export function isGrounded(types, ability, gravityActive, itemName) {
  if (gravityActive || itemName === 'iron-ball') return true
  return !((types || []).includes('flying') || ability === 'levitate' || itemName === 'air-balloon')
}

export function weatherDamageMultiplier(weather, moveTypeName) {
  if ((weather === 'sun' || weather === 'harsh-sunshine') && moveTypeName === 'fire') return 1.5
  if ((weather === 'sun' || weather === 'harsh-sunshine') && moveTypeName === 'water') return 0.5
  if ((weather === 'rain' || weather === 'heavy-rain') && moveTypeName === 'water') return 1.5
  if ((weather === 'rain' || weather === 'heavy-rain') && moveTypeName === 'fire') return 0.5
  if (weather === 'harsh-sunshine' && moveTypeName === 'water') return 0
  if (weather === 'heavy-rain' && moveTypeName === 'fire') return 0
  return 1
}
export function terrainDamageMultiplier(terrain, moveTypeName, grounded) {
  if (!grounded) return 1
  if (terrain === 'electric' && moveTypeName === 'electric') return 1.3
  if (terrain === 'grassy' && moveTypeName === 'grass') return 1.3
  if (terrain === 'psychic' && moveTypeName === 'psychic') return 1.3
  if (terrain === 'misty' && moveTypeName === 'dragon') return 0.5
  return 1
}
export function weatherStatBoost(weather, defenderTypes, statKey) {
  if (weather === 'sand' && statKey === 'special-defense' && defenderTypes.includes('rock')) return 1.5
  if (weather === 'snow' && statKey === 'defense' && defenderTypes.includes('ice')) return 1.5
  return 1
}
export function tailwindSpeedMultiplier(hasTailwind) { return hasTailwind ? 2 : 1 }
// Stealth Rock: 1/8 of max HP scaled by Rock's effectiveness against the victim's types (x4 on Charizard, x1/2 on Steel...).
const ROCK_SUPER_EFFECTIVE = ['fire', 'ice', 'flying', 'bug']
const ROCK_NOT_VERY_EFFECTIVE = ['fighting', 'ground', 'steel']
export function stealthRockDamageFraction(active, types = []) {
  if (!active) return 0
  let m = 1
  for (const t of types || []) {
    if (ROCK_SUPER_EFFECTIVE.includes(t)) m *= 2
    else if (ROCK_NOT_VERY_EFFECTIVE.includes(t)) m *= 0.5
  }
  return 0.125 * m
}
// Spikes only hurt GROUNDED Pokémon (not Flying types, Levitate, Air Balloon; Gravity / Iron Ball ground them).
export function spikesFraction(layers, grounded = true) {
  if (!grounded) return 0
  return { 0: 0, 1: 1 / 8, 2: 1 / 6, 3: 1 / 4 }[layers] ?? 0
}
export function entryHazardFraction(stealthRock, spikesLayers, types = [], grounded = true) {
  return stealthRockDamageFraction(stealthRock, types) + spikesFraction(spikesLayers, grounded)
}
export function effectiveHazardFraction(stealthRock, spikesLayers, itemName, types = [], grounded = true) {
  if (bootsIgnoreHazards(itemName)) return 0
  return entryHazardFraction(stealthRock, spikesLayers, types, grounded)
}
export function leechSeedFraction(active) { return active ? 0.125 : 0 }
export function saltCureFraction(active, types) {
  if (!active) return 0
  return (types || []).some(t => t === 'steel' || t === 'water') ? 0.25 : 0.125
}
export function nightmareFraction(active) { return active ? 0.25 : 0 }
// Entry hazards ONLY (Stealth Rock + Spikes, boots- and grounded-aware): they hit on switch-in, so the holder is
// already below full HP when the move lands — which is what turns Multiscale / Sturdy / Focus Sash off.
export function totalHazardFraction(battleConditions, side, itemName, types, ability = '') {
  const prefix = side === 'you' ? 'your' : 'opp'
  const grounded = isGrounded(types || [], ability, !!battleConditions?.gravity, itemName)
  return effectiveHazardFraction(battleConditions?.[`${prefix}StealthRock`], battleConditions?.[`${prefix}Spikes`], itemName, types || [], grounded)
}
// Leech Seed + Salt Cure + Nightmare: end-of-turn chip. It is NOT taken off the starting HP; the survival simulation
// applies it after each turn (sustain.residual), so it only matters for goals that last more than one hit. HP the
// Pokémon has already lost to it belongs on the HP bar.
export function residualFraction(battleConditions, side, types) {
  const prefix = side === 'you' ? 'your' : 'opp'
  return leechSeedFraction(battleConditions?.[`${prefix}LeechSeed`])
    + saltCureFraction(battleConditions?.[`${prefix}SaltCure`], types)
    + nightmareFraction(battleConditions?.[`${prefix}Nightmare`])
}

// Current HP after applying the HP-bar percentage, then subtracting entry-hazard damage
// (which is a fraction of MAX HP). At 100% this equals the old `hp - hp * hazard`.
export function currentHpAfterHazards(maxHp, hpPercent, hazardFraction) {
  const pct = Math.max(1, Math.min(100, hpPercent ?? 100))
  const current = Math.max(1, Math.floor(maxHp * pct / 100))
  return Math.max(1, current - maxHp * hazardFraction)
}

// Screens cut damage by 1/2 in singles but only ~2/3 (2732/4096) in doubles.
export function screenMultiplier(hasReflect, hasLightScreen, hasAuroraVeil, isPhysical, gameFormat = 'singles') {
  const m = gameFormat === 'doubles' ? 2732 / 4096 : 0.5
  if (hasAuroraVeil) return m
  if (isPhysical && hasReflect) return m
  if (!isPhysical && hasLightScreen) return m
  return 1
}
export function allyBoostMultiplier({ friendGuardAlly, batteryAlly, powerSpotAlly, steelySpiritAlly, isSpecial, moveTypeName }) {
  let m = 1
  if (friendGuardAlly) m *= 0.75
  if (batteryAlly && isSpecial) m *= 1.3
  if (powerSpotAlly) m *= 1.3
  if (steelySpiritAlly && moveTypeName === 'steel') m *= 1.5
  return m
}

// Foresight removes the Ghost-type immunity to Normal/Fighting moves for whichever side has been foresighted.
export function foresightAdjustedMultiplier(rawMultiplier, moveTypeName, defenderTypeNames, foresightActive) {
  if (!foresightActive) return rawMultiplier
  const ghostImmune = (moveTypeName === 'normal' || moveTypeName === 'fighting') && (defenderTypeNames || []).includes('ghost') && rawMultiplier === 0
  return ghostImmune ? 1 : rawMultiplier
}
// Helping Hand: doubles-only, 1.5x power boost from an ally.
export function helpingHandMultiplier(active, gameFormat) { return (active && gameFormat === 'doubles') ? 1.5 : 1 }
// Flower Gift: in Sun, boosts the holder's own Attack and Special Defense by 1.5x.
export function flowerGiftMultiplier(active, weather, statKey) {
  if (!active || (weather !== 'sun' && weather !== 'harsh-sunshine')) return 1
  return (statKey === 'attack' || statKey === 'special-defense') ? 1.5 : 1
}
// Power Trick: swaps which base stat is used for Attack <-> Defense (approximation: swaps the base-stat
// lookup, not full stat history — sufficient for a static EV/SP calculator).
export function powerTrickSwap(statKey, active) {
  if (!active) return statKey
  if (statKey === 'attack') return 'defense'
  if (statKey === 'defense') return 'attack'
  return statKey
}
// Charge: doubles the power of the next Electric move used by whichever side has it active.
export function chargeMultiplier(active, moveTypeName) { return (active && moveTypeName === 'electric') ? 2 : 1 }
// Wonder Room: swaps which defensive stat (Defense <-> Special Defense) a hit is calculated against.
export function wonderRoomSwap(defKey, active) {
  if (!active) return defKey
  if (defKey === 'defense') return 'special-defense'
  if (defKey === 'special-defense') return 'defense'
  return defKey
}

export const SPREAD_MOVES = new Set([
  'earthquake', 'magnitude', 'discharge', 'lava-plume', 'heat-wave', 'muddy-water',
  'surf', 'blizzard', 'petal-blizzard', 'bulldoze', 'eruption', 'water-spout',
  'sludge-wave', 'parabolic-charge', 'snarl', 'brutal-swing', 'glaciate',
  'breaking-swipe', 'dragon-energy', 'expanding-force', 'sandsear-storm', 'wildbolt-storm',
  'astral-barrage', 'glacial-lance', 'diamond-storm', 'clanging-scales', 'clangorous-soulblaze',
  'origin-pulse', 'precipice-blades', 'core-enforcer', 'lands-wrath', 'make-it-rain',
  'matcha-gotcha', 'springtide-storm', 'bleakwind-storm', 'overdrive', 'fiery-wrath',
  'nihil-light', 'burning-jealousy', 'shell-trap', 'relic-song',
  'growl', 'leer', 'tail-whip', 'string-shot', 'cotton-spore', 'poison-gas', 'sweet-scent',
  'struggle-bug', 'icy-wind', 'electroweb', 'disarming-voice', 'dazzling-gleam',
  'razor-leaf', 'razor-wind', 'air-cutter', 'bubble', 'acid', 'incinerate', 'twister',
  'venom-drench', 'thousand-arrows', 'thousand-waves', 'rock-slide', 'hyper-voice',
  'swift', 'captivate', 'heal-block', 'mortal-spin', 'powder-snow', 'dark-void'
])
// The 0.75x applies only while the move actually hits more than one target; `singleTarget` is the per-goal toggle for
// "only one target is left" (default: both targets, as before).
export function spreadMoveMultiplier(moveName, gameFormat, singleTarget = false) {
  return gameFormat === 'doubles' && !singleTarget && SPREAD_MOVES.has(moveName) ? 0.75 : 1
}

// isPhysical = the move's CATEGORY (what Reflect / Light Screen / Ice Scales look at), moveName feeds the
// contact / sound checks of Fluffy and Punk Rock.
export function fieldDamageMultiplier({ moveTypeName, moveName = '', isPhysical, defenderAbility, defenderItem, defenderTypes, battleConditions, defenderSide, typeMultiplier, isCrit = false, gameFormat = 'singles' }) {
  let mult = 1
  // Hydro Steam is boosted (x1.5), not weakened or negated, by sun.
  const sunny = battleConditions?.weather === 'sun' || battleConditions?.weather === 'harsh-sunshine'
  mult *= (moveName === 'hydro-steam' && sunny) ? 1.5 : weatherDamageMultiplier(battleConditions?.weather, moveTypeName)
  const grounded = isGrounded(defenderTypes || [], defenderAbility, !!battleConditions?.gravity, defenderItem)
  mult *= terrainDamageMultiplier(battleConditions?.terrain, moveTypeName, grounded)
  const hasReflect = defenderSide === 'you' ? battleConditions?.yourReflect : battleConditions?.oppReflect
  const hasLightScreen = defenderSide === 'you' ? battleConditions?.yourLightScreen : battleConditions?.oppLightScreen
  const hasAuroraVeil = defenderSide === 'you' ? battleConditions?.yourAuroraVeil : battleConditions?.oppAuroraVeil
  if (!isCrit) mult *= screenMultiplier(hasReflect, hasLightScreen, hasAuroraVeil, isPhysical, gameFormat) // crits ignore Reflect / Light Screen / Aura Veil
  mult *= abilityDamageTakenMultiplier(defenderAbility, moveTypeName, typeMultiplier,
    { isPhysicalCat: isPhysical, isContact: isContactMove(moveName, isPhysical), isSound: SOUND_MOVES.has(moveName) })
  // Resist berries are handled per-hit (consumed after the first hit) via `sustain.firstHitMultiplier`.
  return mult
}

// --- Damage formula: multipliers applied SEQUENTIALLY with a floor after each step,
// matching the real in-game algorithm (random roll -> STAB -> type -> other modifiers). ---
function applyDamageModifiers(base, r, stab, stabMultiplier, typeMultiplier, extraMultiplier) {
  let d = Math.floor(base * r / 100)
  if (stab) d = Math.floor(d * stabMultiplier)
  d = Math.floor(d * typeMultiplier)
  d = Math.floor(d * extraMultiplier)
  if (typeMultiplier === 0 || extraMultiplier === 0) return 0
  return Math.max(1, d) // a hit that isn't nullified always does at least 1
}

// Damage range for ONE use of a move. Handles crits (critMultiplier), multi-hit / Parental Bond (hitSpecs =
// [{ power, scale }, ...], one entry per hit, each with its own 16 rolls) and fixed/special damage (special).
// perHit is the min/max of each individual hit; min/max are the totals for the whole use.
export function calculateDamage({ level, power, attackStat, defenseStat, stab, stabMultiplier = 1.5, typeMultiplier, extraMultiplier = 1, hitSpecs = null, critMultiplier = 1, special = null, currentHp = null, firstHitMultiplier = 1 }) {
  if (special) {
    if (special.immune) return { min: 0, max: 0, perHit: [{ min: 0, max: 0 }] }
    let d
    if (special.kind === 'fixed') d = special.amount
    else if (special.kind === 'half-current') d = Math.max(1, Math.floor((currentHp ?? 0) / 2))
    else d = Math.max(0, Math.ceil(currentHp ?? 0)) // OHKO moves: shown as the target's whole remaining HP
    return { min: d, max: d, perHit: [{ min: d, max: d }] }
  }
  if (typeMultiplier === 0) return { min: 0, max: 0, perHit: [] }
  const specs = hitSpecs ?? [{ power, scale: 1 }]
  const levelFactor = Math.floor(2 * level / 5) + 2
  let totalMin = 0, totalMax = 0
  const perHit = []
  specs.forEach((spec, i) => {
    if (!spec.power) { perHit.push({ min: 0, max: 0 }); return }
    const baseDamage = Math.floor(Math.floor(levelFactor * spec.power * attackStat) / defenseStat)
    let base = Math.floor(baseDamage / 50) + 2
    if (critMultiplier !== 1) base = Math.floor(base * critMultiplier)
    const extra = extraMultiplier * (spec.scale ?? 1) * (i === 0 ? firstHitMultiplier : 1)
    let mn = Infinity, mx = 0
    for (let r = 85; r <= 100; r++) {
      const d = applyDamageModifiers(base, r, stab, stabMultiplier, typeMultiplier, extra)
      if (d < mn) mn = d
      if (d > mx) mx = d
    }
    perHit.push({ min: mn, max: mx })
    totalMin += mn
    totalMax += mx
  })
  return { min: totalMin, max: totalMax, perHit }
}

// Legacy single-hit helpers, kept for backward compatibility. nHitKoProbability/nHitSurvivalProbability
// (below) are the versions actually used throughout the optimizer and postview.
export function survivalProbability({ level, power, attackStat, defenseStat, stab, stabMultiplier = 1.5, typeMultiplier, extraMultiplier = 1 }, hpStat) {
  if (!power || typeMultiplier === 0) return 1
  const levelFactor = Math.floor(2 * level / 5) + 2
  const baseDamage = Math.floor(Math.floor(levelFactor * power * attackStat) / defenseStat)
  const base = Math.floor(baseDamage / 50) + 2
  let survives = 0
  for (let r = 85; r <= 100; r++) {
    if (applyDamageModifiers(base, r, stab, stabMultiplier, typeMultiplier, extraMultiplier) < hpStat) survives++
  }
  return survives / 16
}
export function koProbability({ level, power, attackStat, defenseStat, stab, stabMultiplier = 1.5, typeMultiplier, extraMultiplier = 1 }, oppHP) {
  if (!power || typeMultiplier === 0) return 0
  const levelFactor = Math.floor(2 * level / 5) + 2
  const baseDamage = Math.floor(Math.floor(levelFactor * power * attackStat) / defenseStat)
  const base = Math.floor(baseDamage / 50) + 2
  let kos = 0
  for (let r = 85; r <= 100; r++) {
    if (applyDamageModifiers(base, r, stab, stabMultiplier, typeMultiplier, extraMultiplier) >= oppHP) kos++
  }
  return kos / 16
}

// N-hit (OHKO/2HKO/3HKO/4HKO) probability via combinatorial enumeration over 16 rolls per hit,
// with early-exit once cumulative damage clears the HP threshold.
// N-turn (OHKO/2HKO/3HKO/4HKO) KO probability. Every individual HIT is its own step (16 rolls each), so one
// use of a multi-hit move / Parental Bond move is several steps. HP is simulated step by step (equal-HP
// states are merged), which lets it model:
//   - crits (params.critMultiplier), multi-hit + Parental Bond (params.hitSpecs)
//   - fixed / half-HP / OHKO moves (params.special)
//   - a resist berry (first hit of the first turn only), Sitrus / 1/3-HP berries (can trigger between hits)
//   - Leftovers / Black Sludge (end of each TURN, between uses)
// `sustain` = { maxHp, item, ability, types, firstHitMultiplier }; omit it for plain damage math.
export function nHitKoProbability(params, oppHP, hits = 1, sustain = null) {
  const { level, power, attackStat, defenseStat, stab, stabMultiplier = 1.5, typeMultiplier, extraMultiplier = 1, hitSpecs = null, critMultiplier = 1, special = null, defenseByBoost = null } = params
  if (oppHP <= 0) return 1
  if (special) { if (special.immune) return 0 } else if (typeMultiplier === 0) return 0
  const specs = special ? [special] : (hitSpecs ?? [{ power, scale: 1 }])
  if (!special && !specs.some(s => s.power)) return 0

  const levelFactor = Math.floor(2 * level / 5) + 2
  const firstMult = special ? 1 : (sustain?.firstHitMultiplier ?? 1)
  const cache = new Map()
  // `boost` = net defensive stage the target has gained during this fight (Kee Berry, Stamina, ...).
  function distFor(spec, berryOn, boost) {
    const key = `${spec.power}|${spec.scale ?? 1}|${berryOn ? 1 : 0}|${boost}`
    if (cache.has(key)) return cache.get(key)
    const out = []
    if (!spec.power) {
      out.push([0, 1])
    } else {
      const defStat = (boost !== 0 && defenseByBoost) ? defenseByBoost(boost) : defenseStat
      const baseDamage = Math.floor(Math.floor(levelFactor * spec.power * attackStat) / defStat)
      let base = Math.floor(baseDamage / 50) + 2
      if (critMultiplier !== 1) base = Math.floor(base * critMultiplier)
      const extra = extraMultiplier * (spec.scale ?? 1) * (berryOn ? firstMult : 1)
      const dist = new Map()
      for (let r = 85; r <= 100; r++) {
        const d = applyDamageModifiers(base, r, stab, stabMultiplier, typeMultiplier, extra)
        dist.set(d, (dist.get(d) ?? 0) + 1)
      }
      for (const [d, c] of dist) out.push([d, c / 16])
    }
    cache.set(key, out)
    return out
  }

  const maxHp = sustain?.maxHp ?? oppHP
  const profile = sustain
    ? sustainProfile(sustain.item, sustain.ability, sustain.types ?? [], maxHp)
    : { berry: null, turnEnd: 0 }
  // Leech Seed / Salt Cure / Nightmare chip (a fraction of max HP) comes off at the end of every turn, after the hit.
  if (sustain?.residual) profile.turnEnd -= Math.max(1, Math.floor(maxHp * sustain.residual))
  // Survival effects: Sturdy / Focus Sash (leave 1 HP from full HP), Disguise / Ice Face (absorb the first hit).
  const endure = sustain?.endure ?? null
  const guard = sustain?.guard ?? null
  const effects = (sustain?.onHit ?? []).map(e => ({
    ...e, threshold: e.trigger === 'lowHp' ? Math.floor(maxHp * (e.fraction ?? 0.25)) : 0
  }))

  const turns = Math.max(1, Math.min(4, Math.round(hits)))
  const perTurn = specs.length
  const totalSteps = turns * perTurn
  // State: hp, used (Sitrus-type berry eaten), boost (net defensive stages gained), fired (bitmask of once-only
  // effects spent), guarded (Disguise / Ice Face broken), sash (Focus Sash consumed).
  const mkKey = (s) => `${s.hp}|${s.used ? 1 : 0}|${s.boost}|${s.fired}|${s.guarded ? 1 : 0}|${s.sash ? 1 : 0}`
  const start = { hp: oppHP, used: false, boost: 0, fired: 0, guarded: false, sash: false, p: 1 }
  let states = new Map([[mkKey(start), start]])
  let koProb = 0
  for (let si = 0; si < totalSteps; si++) {
    const turn = Math.floor(si / perTurn), idx = si % perTurn
    const finalStep = si === totalSteps - 1
    const endOfTurn = idx === perTurn - 1
    const next = new Map()
    for (const s of states.values()) {
      let outcomes
      if (special) {
        if (special.kind === 'ohko') outcomes = [[s.hp, 1]]
        else outcomes = [[special.kind === 'fixed' ? special.amount : Math.max(1, Math.floor(s.hp / 2)), 1]]
      } else {
        outcomes = distFor(specs[idx], turn === 0 && idx === 0, s.boost)
      }
      const atFullHp = s.hp >= maxHp
      for (const [d0, w] of outcomes) {
        const p = s.p * w
        let d = d0
        let guarded = s.guarded, sash = s.sash
        if (!guarded && guard && d > 0) {
          // Disguise: the hit is soaked up and the holder only takes 1/8 max HP. Ice Face: no damage at all.
          d = guard.kind === 'disguise' ? Math.floor(maxHp / 8) : 0
          guarded = true
        }
        let hp = s.hp - d
        if (hp <= 0) {
          if (atFullHp && endure === 'sturdy') hp = 1
          else if (atFullHp && endure === 'sash' && !sash) { hp = 1; sash = true }
          else { koProb += p; continue }
        }
        if (finalStep) continue
        let used = s.used, boost = s.boost, fired = s.fired
        if (d > 0 && effects.length) {
          effects.forEach((e, i) => {
            if (e.once && (fired & (1 << i))) return
            if (e.trigger === 'lowHp' && hp > e.threshold) return
            boost = Math.max(-6, Math.min(6, boost + e.stages))
            if (e.once) fired |= (1 << i)
          })
        }
        if (!used && profile.berry && hp <= profile.berry.threshold) {
          hp = Math.min(maxHp, hp + profile.berry.heal)
          used = true
        }
        if (endOfTurn) {
          hp = Math.min(maxHp, hp + profile.turnEnd)
          if (hp <= 0) { koProb += p; continue } // Black Sludge chip finished it off
        }
        const ns = { hp, used, boost, fired, guarded, sash, p }
        const key = mkKey(ns)
        const ex = next.get(key)
        if (ex) ex.p += p
        else next.set(key, ns)
      }
    }
    states = next
  }
  return koProb
}
export function nHitSurvivalProbability(params, hpStat, hits = 1, sustain = null) {
  return 1 - nHitKoProbability(params, hpStat, hits, sustain)
}

// opts.yourFirst / opts.theirFirst = chance each side's Quick Claw / Quick Draw lets it jump its priority bracket.
export function outspeedChance(yourSpeed, theirSpeed, trickRoom, opts = {}) {
  let base
  if (trickRoom) base = yourSpeed < theirSpeed ? 1 : yourSpeed === theirSpeed ? 0.5 : 0
  else base = yourSpeed > theirSpeed ? 1 : yourSpeed === theirSpeed ? 0.5 : 0
  const yQ = opts.yourFirst ?? 0, oQ = opts.theirFirst ?? 0
  if (!yQ && !oQ) return base
  // you jump & they don't -> you move first; both or neither jump -> normal speed order; only they jump -> they move first
  return yQ * (1 - oQ) + base * (yQ * oQ + (1 - yQ) * (1 - oQ))
}

// Quick Claw (20%) / Quick Draw (30%): chance to move first inside the same priority bracket.
export function moveFirstChance(item, ability) {
  let miss = 1
  if (item === 'quick-claw') miss *= 0.8
  if (ability === 'quick-draw') miss *= 0.7
  return 1 - miss
}
// Lagging Tail / Full Incense / Stall: always move last inside the priority bracket.
export function movesLast(item, ability) {
  return item === 'lagging-tail' || item === 'full-incense' || ability === 'stall'
}
// How an outspeed goal is decided. `decided` is 'win' / 'lose' when priority (or a move-last item) settles who
// moves first no matter what Speed is — then Speed EVs are irrelevant for that goal. Otherwise Speed decides,
// with Quick Claw / Quick Draw chances layered on top.
export function speedOrderInfo(g, userItem, userAbility) {
  const yourLast = movesLast(userItem, userAbility), oppLast = movesLast(g.opponentItem, g.opponentAbility)
  let decided = null
  if (yourLast !== oppLast) decided = oppLast ? 'win' : 'lose'
  return {
    decided,
    yourFirst: decided ? 0 : moveFirstChance(userItem, userAbility),
    theirFirst: decided ? 0 : moveFirstChance(g.opponentItem, g.opponentAbility)
  }
}

export function overallHarm(D, S, H, k = 20000, I = 1) {
  if (D <= 0 || S <= 0 || H <= 0) return Infinity
  return (k * (D + I * S) + 4 * D * S) / (H * D * S)
}

export function effectiveSpeedMultiplier(item, ability, weather, hasTailwind, status, terrain = 'none') {
  return speedItemMultiplier(item) * abilityStatMultiplier(ability, 'speed', weather, status, terrain)
    * tailwindSpeedMultiplier(hasTailwind) * statusParalysisSpeedMultiplier(status, ability)
}

export function dominantOffensiveStat(userMoveCategories, pokemonData) {
  const physical = userMoveCategories.filter(c => c === 'physical').length
  const special = userMoveCategories.filter(c => c === 'special').length
  const bodyPress = userMoveCategories.filter(c => c === 'body-press').length
  if (physical === 0 && special === 0) {
    if (bodyPress > 0) return 'defense'
    if (!pokemonData) return 'attack'
    const atk = pokemonData.stats.find(s => s.stat.name === 'attack').base_stat
    const spa = pokemonData.stats.find(s => s.stat.name === 'special-attack').base_stat
    return spa > atk ? 'special-attack' : 'attack'
  }
  return special > physical ? 'special-attack' : 'attack'
}
function goalDrivenOffensiveStat(goals, userMoveCategories, pokemonData) {
  const koGoal = goals.find(g => g.type === 'ko' && g.koMoveOffKey && g.koMoveName !== 'foul-play' && !g.effectiveKoMoveSpecial)
  if (koGoal) return koGoal.koMoveOffKey
  return dominantOffensiveStat(userMoveCategories, pokemonData)
}
function unusedOffensiveStat(goals, userMoveCategories, pokemonData) {
  const dominant = goalDrivenOffensiveStat(goals, userMoveCategories, pokemonData)
  return dominant === 'attack' ? 'special-attack' : 'attack'
}
// Your own Attack stat (with stat stages) at a given EV/SP investment — what an opposing Foul Play uses.
function ownAttackStatFor(system, pokemonData, ivs, points, natureName, stages) {
  const base = pokemonData.stats.find(s => s.stat.name === 'attack').base_stat
  return { raw: ownStatAt(system, 'attack', base, ivs, points, natureName), stage: stages?.attack ?? 0 }
}

// ============ Critical hits ============
export const ALWAYS_CRIT_MOVES = new Set(['frost-breath', 'storm-throw', 'wicked-blow', 'surging-strikes', 'flower-trick'])
// critToggle = the Field panel's "Attacks crit" switch for the attacking side. Battle Armor / Shell Armor stop crits.
// Sniper makes a crit hit for 2.25x instead of 1.5x.
export function critInfo(moveName, attackerAbility, defenderAbility, critToggle) {
  const wants = ALWAYS_CRIT_MOVES.has(moveName) || !!critToggle
  const prevented = defenderAbility === 'battle-armor' || defenderAbility === 'shell-armor'
  const isCrit = wants && !prevented
  return { isCrit, multiplier: isCrit ? (attackerAbility === 'sniper' ? 2.25 : 1.5) : 1 }
}
// A crit ignores the attacker's NEGATIVE offensive stages and the defender's POSITIVE defensive stages.
export function critOffStage(stage, isCrit) { return isCrit ? Math.max(0, stage) : stage }
export function critDefStage(stage, isCrit) { return isCrit ? Math.min(0, stage) : stage }

// ============ Multi-hit moves & Parental Bond ============
const TWO_TO_FIVE_MOVES = ['bone-rush', 'arm-thrust', 'barrage', 'bullet-seed', 'comet-punch', 'double-slap', 'fury-attack',
  'fury-swipes', 'icicle-spear', 'pin-missile', 'rock-blast', 'scale-shot', 'spike-cannon', 'tail-slap', 'water-shuriken']
const FIXED_TWO_HIT_MOVES = ['bonemerang', 'double-hit', 'double-iron-bash', 'double-kick', 'dragon-darts', 'dual-chop',
  'dual-wingbeat', 'gear-grind', 'twin-beam', 'twineedle', 'tachyon-cutter']
export const MULTI_HIT_MOVES = {}
for (const n of TWO_TO_FIVE_MOVES) MULTI_HIT_MOVES[n] = { min: 2, max: 5 }
for (const n of FIXED_TWO_HIT_MOVES) MULTI_HIT_MOVES[n] = { min: 2, max: 2 }
MULTI_HIT_MOVES['surging-strikes'] = { min: 3, max: 3 }
MULTI_HIT_MOVES['triple-dive'] = { min: 3, max: 3 }
MULTI_HIT_MOVES['triple-axel'] = { min: 1, max: 3, powers: [20, 40, 60] } // each hit is stronger
MULTI_HIT_MOVES['triple-kick'] = { min: 1, max: 3, powers: [10, 20, 30] }
MULTI_HIT_MOVES['population-bomb'] = { min: 1, max: 10 }
// Loaded Dice only helps the "2-5 hit" moves and Population Bomb.
const LOADED_DICE_MOVES = new Set([...TWO_TO_FIVE_MOVES, 'population-bomb'])
export function multiHitInfo(moveName) { return MULTI_HIT_MOVES[moveName] ?? null }
export function hitCountOptions(moveName) {
  const mh = MULTI_HIT_MOVES[moveName]
  if (!mh) return [1]
  const out = []
  for (let n = mh.min; n <= mh.max; n++) out.push(n)
  return out
}
// Default hit count: 2, or the max with Skill Link, or 4 with Loaded Dice. Fixed-hit moves are always their fixed count.
export function defaultHitCount(moveName, ability, item) {
  const mh = MULTI_HIT_MOVES[moveName]
  if (!mh) return 1
  if (mh.min === mh.max) return mh.max
  if (ability === 'skill-link') return mh.max
  if (item === 'loaded-dice' && LOADED_DICE_MOVES.has(moveName)) return Math.min(4, mh.max)
  return Math.min(2, mh.max)
}
const PARENTAL_BOND_EXEMPT = new Set(['explosion', 'self-destruct', 'misty-explosion', 'final-gambit', 'endeavor', 'fling',
  'solar-beam', 'solar-blade', 'sky-attack', 'skull-bash', 'razor-wind', 'freeze-shock', 'ice-burn', 'bide', 'counter', 'mirror-coat', 'metal-burst'])
// Parental Bond: a single-hit damaging move hits a second time at 25% power (not multi-hit, spread-in-doubles or special-damage moves).
export function parentalBondApplies(ability, moveName, gameFormat, singleTarget = false) {
  if (ability !== 'parental-bond') return false
  if (MULTI_HIT_MOVES[moveName] || PARENTAL_BOND_EXEMPT.has(moveName)) return false
  if (specialDamageKind(moveName, 100)) return false
  if (gameFormat === 'doubles' && !singleTarget && SPREAD_MOVES.has(moveName)) return false
  return true
}
// One entry per hit: [{ power, scale }]. scale multiplies that hit's damage (Parental Bond's 2nd hit = 0.25).
export function buildHitSpecs(moveName, count, power, parentalBond) {
  const mh = MULTI_HIT_MOVES[moveName]
  if (mh) {
    const n = Math.max(mh.min, Math.min(mh.max, Math.round(count ?? Math.min(2, mh.max))))
    const powers = mh.powers ? mh.powers.slice(0, n) : Array(n).fill(power)
    return powers.map(p => ({ power: p, scale: 1 }))
  }
  if (parentalBond) return [{ power, scale: 1 }, { power, scale: 0.25 }]
  return [{ power, scale: 1 }]
}

// ============ Fixed-damage & special-damage moves ============
export const FIXED_DAMAGE_MOVES = { 'seismic-toss': 'level', 'night-shade': 'level', 'dragon-rage': 40, 'sonic-boom': 20 }
export const HALF_CURRENT_HP_MOVES = new Set(['super-fang', 'natures-madness', 'ruination'])
export const OHKO_MOVES = new Set(['fissure', 'guillotine', 'horn-drill', 'sheer-cold'])
export function specialDamageKind(moveName, attackerLevel) {
  if (Object.prototype.hasOwnProperty.call(FIXED_DAMAGE_MOVES, moveName)) {
    const v = FIXED_DAMAGE_MOVES[moveName]
    return { kind: 'fixed', amount: v === 'level' ? attackerLevel : v }
  }
  if (HALF_CURRENT_HP_MOVES.has(moveName)) return { kind: 'half-current' }
  if (OHKO_MOVES.has(moveName)) return { kind: 'ohko' }
  return null
}
// Type immunities still apply to these moves; OHKO moves also fail vs Sturdy, vs a higher-level target, and Sheer Cold vs Ice.
export function specialIsImmune(special, moveName, typeMultiplier, defenderAbility, defenderTypes, attackerLevel, defenderLevel) {
  if (!special) return false
  if (typeMultiplier === 0) return true
  if (special.kind === 'ohko') {
    if (defenderAbility === 'sturdy') return true
    if (moveName === 'sheer-cold' && (defenderTypes || []).includes('ice')) return true
    if (attackerLevel != null && defenderLevel != null && defenderLevel > attackerLevel) return true
  }
  return false
}
function natureLowers(natureName, statKey) { return NATURES[natureName]?.minus === statKey }
function popcount(x) { let c = 0; while (x) { c += x & 1; x >>= 1 }; return c }

export function attackerAllyMultiplier(battleConditions, attackerSide, isSpecial, moveTypeName, gameFormat) {
  if (!battleConditions || gameFormat !== 'doubles') return 1
  const prefix = attackerSide === 'you' ? 'your' : 'opp'
  return allyBoostMultiplier({
    friendGuardAlly: false,
    batteryAlly: !!battleConditions[`${prefix}Battery`],
    powerSpotAlly: !!battleConditions[`${prefix}PowerSpot`],
    steelySpiritAlly: !!battleConditions[`${prefix}SteelySpirit`],
    isSpecial, moveTypeName
  })
}
export function defenderAllyMultiplier(battleConditions, defenderSide, gameFormat) {
  if (!battleConditions || gameFormat !== 'doubles') return 1
  const prefix = defenderSide === 'you' ? 'your' : 'opp'
  return battleConditions[`${prefix}FriendGuard`] ? 0.75 : 1
}

// ============ POKÉMON CHAMPIONS CONSTANTS ============
export const CHAMPIONS_LEVEL = 50
export const CHAMPIONS_IV = 31
export const CHAMPIONS_MAX_SP_TOTAL = 66
export const CHAMPIONS_MAX_SP_PER_STAT = 32

export function calculateStatChampions(statKey, base, sp, natureName) {
  const innerBase = Math.floor((2 * base + CHAMPIONS_IV) * CHAMPIONS_LEVEL / 100)
  if (statKey === 'hp') return innerBase + sp + CHAMPIONS_LEVEL + 10
  const raw = innerBase + sp + 5
  return Math.floor(raw * natureMultiplier(statKey, natureName))
}

// ============ UNIFIED SYSTEM CORE — used by BOTH EV mode and Champions mode ============
function evSystem(level) { return { isChampions: false, maxPerStat: 252, totalBudget: 510, step: 4, level } }
function spSystem() { return { isChampions: true, maxPerStat: CHAMPIONS_MAX_SP_PER_STAT, totalBudget: CHAMPIONS_MAX_SP_TOTAL, step: 1, level: CHAMPIONS_LEVEL } }

function ownStatAt(system, statKey, base, ivs, points, nature) {
  if (system.isChampions) return calculateStatChampions(statKey, base, points, nature)
  return calculateStat(statKey, base, ivs?.[statKey] ?? 31, points, system.level, nature)
}
function oppStatAt(system, statKey, base, oppIvs, oppPoints, nature, oppLevel) {
  if (system.isChampions) return calculateStatChampions(statKey, base, oppPoints?.[statKey] ?? 0, nature)
  return calculateStat(statKey, base, oppIvs?.[statKey] ?? 31, oppPoints?.[statKey] ?? 0, oppLevel, nature)
}
function oppPointsOf(system, g) { return system.isChampions ? (g.opponentSp ?? {}) : (g.opponentEvs ?? {}) }
function oppIvsOf(system, g) { return system.isChampions ? {} : (g.opponentIvs ?? {}) }
function oppLevelOf(system, g) { return system.isChampions ? CHAMPIONS_LEVEL : (g.opponentLevel ?? 100) }

function speedTargetForGoalsGeneric(system, outspeedGoals, battleConditions) {
  let target = 0
  for (const g of outspeedGoals) {
    if (g.opponentBaseSpeed == null) continue
    const oppIvs = oppIvsOf(system, g), oppPoints = oppPointsOf(system, g), oppLevel = oppLevelOf(system, g)
    const oppNature = g.opponentNature ?? 'Hardy'
    let speed = oppStatAt(system, 'speed', g.opponentBaseSpeed, oppIvs, oppPoints, oppNature, oppLevel)
    speed = applyStage(speed, g.opponentStages?.speed ?? 0)
    speed = Math.floor(speed * effectiveSpeedMultiplier(g.opponentItem, g.opponentAbility, battleConditions?.weather, battleConditions?.oppTailwind, battleConditions?.oppStatus, battleConditions?.terrain))
    target = Math.max(target, speed)
  }
  return target > 0 ? target : null
}

function genericToSurviveDescriptor(system, g, battleConditions, gameFormat, ownAttack = null) {
  const moveTypeName = g.effectiveMoveTypeName ?? g.moveTypeName
  const movePower = g.effectiveMovePower ?? g.movePower
  const moveDefKey = wonderRoomSwap(g.moveDefKey, !!battleConditions?.wonderRoom)
  const catPhysical = g.moveOffKey !== 'special-attack' // the move's CATEGORY (Body Press is physical, Psyshock special)
  const gravityActive = !!battleConditions?.gravity
  const weather = battleConditions?.weather, terrain = battleConditions?.terrain
  // Your ability as THIS attack sees it: Mold Breaker / Teravolt / Turboblaze and ability-ignoring moves switch it off.
  const defAbility = effectiveDefenderAbility(g.opponentAbility, g.moveName, g.userAbility)
  const userTypes = g.userTypesList ?? []
  const crit = critInfo(g.moveName, g.opponentAbility, defAbility, !!battleConditions?.oppCrit)

  const oppIvs = oppIvsOf(system, g), oppPoints = oppPointsOf(system, g), oppLevel = oppLevelOf(system, g)
  const oppNature = g.opponentNature ?? 'Hardy'
  const rawAttack = oppStatAt(system, g.moveOffKey, g.opponentAttackBase, oppIvs, oppPoints, oppNature, oppLevel)
  // Foul Play hits with the TARGET's (your) Attack stat + stages, which Unaware never ignores.
  // Otherwise, a defender with Unaware ignores the attacker's offensive stat stages.
  const isFoulPlay = g.moveName === 'foul-play' && ownAttack != null
  const ignoreAtkStages = defAbility === 'unaware' && !isFoulPlay
  const staged = isFoulPlay
    ? applyStage(ownAttack.raw, critOffStage(clampStage(ownAttack.stage), crit.isCrit))
    : (ignoreAtkStages ? rawAttack : applyStage(rawAttack, critOffStage(clampStage(g.opponentStages?.[g.moveOffKey] ?? 0), crit.isCrit)))
  const itemMult = offenseItemMultiplier(g.opponentItem, g.moveOffKey, moveTypeName, g.opponentName)
  const abilityMult = abilityStatMultiplier(g.opponentAbility, g.moveOffKey, weather, battleConditions?.oppStatus, terrain)
  const fgMult = flowerGiftMultiplier(!!battleConditions?.oppFlowerGift, weather, g.moveOffKey)
  const ruinMult = ruinStatMultiplier(g.moveOffKey, g.opponentAbility, g.userAbility)
  const attackStat = Math.floor(staged * itemMult * abilityMult * fgMult * ruinMult
  * defenseAsOffenseMultiplier(g.moveOffKey, g.opponentItem, weather, g.opponentTypes ?? [], g.opponentCanEvolve))

  const rawTypeMult = g.goalTypeMultiplier ?? 1
  const blocked = abilityBlocksMoveType(defAbility, moveTypeName, gravityActive, g.userItem)
  let typeMultiplier = blocked ? 0 : rawTypeMult
  typeMultiplier = foresightAdjustedMultiplier(typeMultiplier, moveTypeName, userTypes, !!battleConditions?.yourForesight)

  const fieldMult = fieldDamageMultiplier({
    moveTypeName, moveName: g.moveName, isPhysical: catPhysical,
    defenderAbility: defAbility, defenderItem: g.userItem, defenderTypes: userTypes,
    battleConditions, defenderSide: 'you', typeMultiplier, isCrit: crit.isCrit, gameFormat
  })

  const special0 = g.effectiveMoveSpecial ?? null
  const special = special0
    ? { ...special0, immune: specialIsImmune(special0, g.moveName, typeMultiplier, defAbility, userTypes, oppLevel, system.level) }
    : null
  const powerChain = basePowerModifiers({
    ability: g.opponentAbility, item: g.opponentItem, moveName: g.moveName, moveTypeName, isPhysicalCat: catPhysical,
    effectivePower: movePower, weather, hpPercent: g.opponentHpPercent ?? 100, hasSecondary: !!g.moveHasSecondary
  })
  const hitSpecs = special ? null : scaleHitSpecPowers(buildHitSpecs(g.moveName, g.moveHitCount ?? 1, movePower, !!g.moveParentalBond), powerChain)

  // Multiscale / Shadow Shield / Sturdy / Focus Sash need FULL HP: hazards, chip and a damaged HP bar all switch them off.
  const youFull = (battleConditions?.yourHpPercent ?? 100) >= 100 && totalHazardFraction(battleConditions, 'you', g.userItem, userTypes, g.userAbility) <= 0
  const firstHitMultiplier = berryResistMultiplier(g.userItem, moveTypeName, typeMultiplier, g.userAbility)
    * firstHitDefenderMultiplier(defAbility, youFull)

  return {
    power: movePower, attackStat,
    stab: (g.opponentTypes ?? []).includes(moveTypeName) || hasUniversalStab(g.opponentAbility),
    stabMultiplier: abilityStabMultiplier(g.opponentAbility),
    typeMultiplier,
    extraMultiplier: superEffectiveMoveMultiplier(g.moveName, typeMultiplier) * expertBeltMultiplier(g.opponentItem, typeMultiplier) * attackerFinalMultiplier(g.opponentAbility, g.opponentItem, typeMultiplier) * fieldMult
      * spreadMoveMultiplier(g.moveName, gameFormat, !!g.moveSingleTarget) * abilityDamageDealtMultiplier(g.opponentAbility, typeMultiplier)
      * auraMultiplier(moveTypeName, g.opponentAbility, g.userAbility)
      * attackerAllyMultiplier(battleConditions, 'opponent', g.moveOffKey === 'special-attack', moveTypeName, gameFormat)
      * defenderAllyMultiplier(battleConditions, 'you', gameFormat)
      * helpingHandMultiplier(!!battleConditions?.oppHelpingHand, gameFormat)
      * chargeMultiplier(!!battleConditions?.oppCharge, moveTypeName)
      * burnDamageMultiplier(battleConditions?.oppStatus, catPhysical, g.opponentAbility)
      * knockOffBoostMultiplier(g.moveName, g.userItem, defAbility)
      * (g.moveAbilityDamageMultiplier ?? 1),
    defKey: moveDefKey,
    // Everything that scales YOUR Defense / Sp. Def stat for this attack (item, weather, abilities, status, Ruin).
    defStatMult: defenderStatMultiplier({
      defKey: moveDefKey, item: g.userItem, ability: defAbility, types: userTypes, weather, terrain,
      status: battleConditions?.yourStatus, flowerGift: !!battleConditions?.yourFlowerGift, attackerAbility: g.opponentAbility,
      canEvolve: g.userCanEvolve
    }),
    hitSpecs, powerChain, critMultiplier: crit.multiplier, isCrit: crit.isCrit, special,
    ignoreDefenderStages: g.opponentAbility === 'unaware', // attacker's Unaware ignores YOUR defensive stages
    hits: g.surviveHits ?? 1,
    sustain: {
      item: g.userItem, ability: g.userAbility, types: userTypes,
      residual: residualFraction(battleConditions, 'you', userTypes),
      firstHitMultiplier,
      endure: defAbility === 'sturdy' ? 'sturdy' : (g.userItem === 'focus-sash' ? 'sash' : null),
      guard: defAbility === 'disguise' ? { kind: 'disguise' } : (defAbility === 'ice-face' && catPhysical ? { kind: 'ice-face' } : null),
      onHit: defenderOnHitEffects({ item: g.userItem, ability: g.userAbility, moveTypeName, isPhysicalCat: catPhysical, defKey: moveDefKey })
    }
  }
}

// Everything about ONE "KO the opponent" goal that does not depend on your own Attack investment: their defense
// (with stages, item, weather, abilities, Ruin), HP, type matchup, damage modifiers, hit specs and survival effects.
function koGoalContext(system, g, { userAbility, userItem, userTypes }, battleConditions, gameFormat) {
  const moveName = g.koMoveName
  const moveTypeName = g.effectiveKoMoveTypeName ?? g.koMoveTypeName
  const movePower = g.effectiveKoMovePower ?? g.koMovePower
  const offKey = g.koMoveOffKey
  const defKey = wonderRoomSwap(g.koMoveDefKey, !!battleConditions?.wonderRoom)
  const catPhysical = offKey !== 'special-attack'
  const gravityActive = !!battleConditions?.gravity
  const weather = battleConditions?.weather, terrain = battleConditions?.terrain
  const oppTypes = g.opponentTypesList ?? g.opponentTypes ?? []
  const defAbility = effectiveDefenderAbility(userAbility, moveName, g.opponentAbility)
  const crit = critInfo(moveName, userAbility, defAbility, !!battleConditions?.yourCrit)
  const oppIvs = oppIvsOf(system, g), oppPoints = oppPointsOf(system, g), oppLevel = oppLevelOf(system, g)
  const oppNature = g.opponentNature ?? 'Hardy'

  const rawDef = oppStatAt(system, defKey, g.opponentDefBase, oppIvs, oppPoints, oppNature, oppLevel)
  const oppStage = g.opponentStages?.[defKey] ?? 0
  const ignoreOppStages = userAbility === 'unaware' // Unaware ignores their defensive stages (and any boost they gain mid-fight)
  const defStatMult = defenderStatMultiplier({
    defKey, item: g.opponentItem, ability: defAbility, types: oppTypes, weather, terrain,
    status: battleConditions?.oppStatus, flowerGift: !!battleConditions?.oppFlowerGift, attackerAbility: userAbility,
    canEvolve: g.opponentCanEvolve
  })
  const defenseAt = (boost = 0) => Math.floor(applyStage(rawDef, ignoreOppStages ? 0 : critDefStage(oppStage + boost, crit.isCrit)) * defStatMult)

  const oppMaxHp = oppStatAt(system, 'hp', g.opponentHPBase, oppIvs, oppPoints, oppNature, oppLevel)
  const oppHazard = totalHazardFraction(battleConditions, 'opponent', g.opponentItem, oppTypes, g.opponentAbility)
  const oppHP = currentHpAfterHazards(oppMaxHp, g.opponentHpPercent, oppHazard)

  const blocked = abilityBlocksMoveType(defAbility, moveTypeName, gravityActive, g.opponentItem)
  let typeMultiplier = blocked ? 0 : (g.koTypeMultiplier ?? 1)
  typeMultiplier = foresightAdjustedMultiplier(typeMultiplier, moveTypeName, oppTypes, !!battleConditions?.oppForesight)

  const fieldMult = fieldDamageMultiplier({
    moveTypeName, moveName, isPhysical: catPhysical,
    defenderAbility: defAbility, defenderItem: g.opponentItem, defenderTypes: oppTypes,
    battleConditions, defenderSide: 'opponent', typeMultiplier, isCrit: crit.isCrit, gameFormat
  })
  const extraMultiplier = superEffectiveMoveMultiplier(moveName, typeMultiplier) * expertBeltMultiplier(userItem, typeMultiplier) * attackerFinalMultiplier(userAbility, userItem, typeMultiplier) * fieldMult
    * spreadMoveMultiplier(moveName, gameFormat, !!g.koSingleTarget) * abilityDamageDealtMultiplier(userAbility, typeMultiplier)
    * auraMultiplier(moveTypeName, userAbility, g.opponentAbility)
    * attackerAllyMultiplier(battleConditions, 'you', offKey === 'special-attack', moveTypeName, gameFormat)
    * defenderAllyMultiplier(battleConditions, 'opponent', gameFormat)
    * helpingHandMultiplier(!!battleConditions?.yourHelpingHand, gameFormat)
    * chargeMultiplier(!!battleConditions?.yourCharge, moveTypeName)
    * burnDamageMultiplier(battleConditions?.yourStatus, catPhysical, userAbility)
    * knockOffBoostMultiplier(moveName, g.opponentItem, defAbility)
    * (g.koMoveAbilityDamageMultiplier ?? 1)

  const special0 = g.effectiveKoMoveSpecial ?? null
  const special = special0
    ? { ...special0, immune: specialIsImmune(special0, moveName, typeMultiplier, defAbility, oppTypes, system.level, oppLevel) }
    : null
  const powerChain = basePowerModifiers({
    ability: userAbility, item: userItem, moveName, moveTypeName, isPhysicalCat: catPhysical,
    effectivePower: movePower, weather, hpPercent: battleConditions?.yourHpPercent ?? 100, hasSecondary: !!g.koMoveHasSecondary
  })
  const hitSpecs = special ? null : scaleHitSpecPowers(buildHitSpecs(moveName, g.koMoveHitCount ?? 1, movePower, !!g.koMoveParentalBond), powerChain)

  let fixedAttack = null
  if (moveName === 'foul-play') {
    const rawOppAtk = oppStatAt(system, 'attack', g.opponentAtkBase, oppIvs, oppPoints, oppNature, oppLevel)
    fixedAttack = applyStage(rawOppAtk, critOffStage(g.opponentStages?.attack ?? 0, crit.isCrit))
  }
  const oppFull = (g.opponentHpPercent ?? 100) >= 100 && oppHazard <= 0
  const defenseStat = defenseAt(0)
  const effects = defenderOnHitEffects({ item: g.opponentItem, ability: g.opponentAbility, moveTypeName, isPhysicalCat: catPhysical, defKey })
  return {
    moveName, moveTypeName, power: movePower, offKey, defKey, catPhysical,
    isCrit: crit.isCrit, critMultiplier: crit.multiplier,
    oppHP, oppMaxHp, oppTypes, oppLevel,
    defenseStat, defenseByBoost: effects.length ? defenseAt : null,
    stab: userTypes.includes(moveTypeName) || hasUniversalStab(userAbility), stabMultiplier: abilityStabMultiplier(userAbility),
    typeMultiplier, extraMultiplier, special, hitSpecs, powerChain, fixedAttack,
    hits: g.koHits ?? 1,
    ignoreAttackStages: defAbility === 'unaware' && moveName !== 'foul-play',
    sustain: {
      maxHp: oppMaxHp, item: g.opponentItem, ability: g.opponentAbility, types: oppTypes,
      residual: residualFraction(battleConditions, 'opponent', oppTypes),
      firstHitMultiplier: berryResistMultiplier(g.opponentItem, moveTypeName, typeMultiplier, g.opponentAbility)
        * firstHitDefenderMultiplier(defAbility, oppFull),
      endure: defAbility === 'sturdy' ? 'sturdy' : (g.opponentItem === 'focus-sash' ? 'sash' : null),
      guard: defAbility === 'disguise' ? { kind: 'disguise' } : (defAbility === 'ice-face' && catPhysical ? { kind: 'ice-face' } : null),
      onHit: effects
    }
  }
}

function genericMinOffPointsForBestKO(system, { pokemonData, ivs, nature, c, userItem, userAbility, userStages, weather, terrain, userStatus, extraStatMultiplier = 1, powerTrickActive = false }) {
  const offKey = c.offKey
  const lookupKey = powerTrickSwap(offKey, powerTrickActive)
  const base = pokemonData.stats.find(s => s.stat.name === lookupKey).base_stat
  const itemMult = offenseItemMultiplier(userItem, offKey, c.moveTypeName, pokemonData.name)
  const abilityMult = abilityStatMultiplier(userAbility, offKey, weather, userStatus, terrain)
  const stage = c.ignoreAttackStages ? 0 : critOffStage(clampStage(userStages?.[offKey] ?? 0), c.isCrit)
  const mk = (attackStat) => ({
    level: system.level, power: c.power, attackStat, defenseStat: c.defenseStat, defenseByBoost: c.defenseByBoost,
    stab: c.stab, stabMultiplier: c.stabMultiplier, typeMultiplier: c.typeMultiplier, extraMultiplier: c.extraMultiplier,
    hitSpecs: c.hitSpecs, critMultiplier: c.critMultiplier, special: c.special
  })
  const prob = (attackStat) => nHitKoProbability(mk(attackStat), c.oppHP, c.hits, c.sustain)

  if (c.special || c.fixedAttack != null) {
    // Fixed-damage moves ignore your stats; Foul Play uses the target's Attack. Either way no Attack investment helps.
    const attackStat = c.fixedAttack != null ? Math.floor(c.fixedAttack * itemMult * abilityMult * extraStatMultiplier) : 0
    return { points: 0, prob: prob(attackStat) }
  }

  const rawMax = ownStatAt(system, offKey, base, ivs, system.maxPerStat, nature)
  const attackStatMax = Math.floor(applyStage(rawMax, stage) * itemMult * abilityMult * extraStatMultiplier)
  const bestProb = prob(attackStatMax)

  for (let p = 0; p <= system.maxPerStat; p += system.step) {
    const raw = ownStatAt(system, offKey, base, ivs, p, nature)
    const attackStat = Math.floor(applyStage(raw, stage) * itemMult * abilityMult * extraStatMultiplier)
    const pr = prob(attackStat)
    if (pr >= bestProb) return { points: p, prob: pr }
  }
  return { points: system.maxPerStat, prob: bestProb }
}

function genericKoRequirementForNature(system, koGoals, natureName, pokemonData, ivs, userItem, userAbility, userStages, battleConditions, gameFormat) {
  let atk = 0, spAtk = 0, def = 0, minProb = 1
  const userTypes = (pokemonData.types ?? []).map(t => t.type.name)
  const powerTrickActive = !!battleConditions?.yourPowerTrick
  const flowerGiftYour = !!battleConditions?.yourFlowerGift
  const yourStatus = battleConditions?.yourStatus

  for (const g of koGoals) {
    const c = koGoalContext(system, g, { userAbility, userItem, userTypes }, battleConditions, gameFormat)
    const { points, prob } = genericMinOffPointsForBestKO(system, {
      pokemonData, ivs, nature: natureName, c, userItem, userAbility, userStages,
      weather: battleConditions?.weather, terrain: battleConditions?.terrain, userStatus: yourStatus,
      extraStatMultiplier: flowerGiftMultiplier(flowerGiftYour, battleConditions?.weather, c.offKey)
        * ruinStatMultiplier(c.offKey, userAbility, g.opponentAbility)
        * defenseAsOffenseMultiplier(c.offKey, userItem, battleConditions?.weather, userTypes, pokemonData.canEvolve),
      powerTrickActive
    })
    if (c.offKey === 'attack') atk = Math.max(atk, points)
    else if (c.offKey === 'defense') def = Math.max(def, points)
    else spAtk = Math.max(spAtk, points)
    minProb = Math.min(minProb, prob)
  }
  return { atk, spAtk, def, totalCost: atk + spAtk + def, minProb }
}

// Which of YOUR defensive stages count against a given incoming hit: none if the attacker has Unaware,
// only the negative ones if it's a crit.
function effDefStage(stage, g) { return g.ignoreDefenderStages ? 0 : critDefStage(stage, g.isCrit) }
// Your Defense / Sp. Def against one incoming hit, after stages (Unaware / crit aware) and every stat multiplier.
// `boost` = extra stages gained mid-fight (Kee Berry, Stamina ...).
function defStatFor(g, raw, stage, boost = 0) {
  return Math.floor(applyStage(raw, effDefStage(stage + boost, g)) * g.defStatMult)
}
// rawDef / stage let the simulation recompute the defense stat when an on-hit boost fires.
function paramsFromDescriptor(g, level, defenseStat, rawDef = null, stage = 0) {
  return {
    level, power: g.power, attackStat: g.attackStat, defenseStat, stab: g.stab,
    stabMultiplier: g.stabMultiplier, typeMultiplier: g.typeMultiplier, extraMultiplier: g.extraMultiplier,
    hitSpecs: g.hitSpecs, critMultiplier: g.critMultiplier, special: g.special,
    defenseByBoost: (g.sustain?.onHit?.length && rawDef != null) ? (b) => defStatFor(g, rawDef, stage, b) : null
  }
}

function buildDefenseProbArrayGeneric(system, { goals, pokemonData, ivs, nature, userItem, userStages, weather, hpStat, hpMaxHp, defKey, powerTrickActive = false, flowerGiftActive = false }) {
  const arr = []
  if (goals.length === 0) {
    for (let p = 0; p <= system.maxPerStat; p += system.step) arr.push(1)
    return arr
  }
  const lookupKey = powerTrickSwap(defKey, powerTrickActive)
  const base = pokemonData.stats.find(s => s.stat.name === lookupKey).base_stat
  const stage = userStages?.[defKey] ?? 0
  for (let p = 0; p <= system.maxPerStat; p += system.step) {
    const raw = ownStatAt(system, defKey, base, ivs, p, nature)
    let minProb = 1
    for (const g of goals) {
      const defenseStat = defStatFor(g, raw, stage)
      const prob = nHitSurvivalProbability(paramsFromDescriptor(g, system.level, defenseStat, raw, stage), hpStat, g.hits ?? 1, { ...g.sustain, maxHp: hpMaxHp })
      minProb = Math.min(minProb, prob)
    }
    arr.push(minProb)
  }
  return arr
}

function bestJointDefenseAllocation(physArr, specArr, remainingBudget, step, minDefIdx = 0) {
  let defIdx = minDefIdx, specIdx = 0
  for (let k = 16; k >= 0; k--) {
    const target = k / 16
    const dFound = physArr.findIndex(p => p >= target)
    const sIdx = specArr.findIndex(p => p >= target)
    if (dFound === -1 || sIdx === -1) continue
    const dIdx = Math.max(dFound, minDefIdx)
    if (dIdx * step + sIdx * step <= remainingBudget) { defIdx = dIdx; specIdx = sIdx; break }
  }
  let cost = defIdx * step + specIdx * step
  let leftover = remainingBudget - cost
  let improved = true
  while (leftover >= step && improved) {
    improved = false
    const order = physArr[defIdx] <= specArr[specIdx] ? ['def', 'spec'] : ['spec', 'def']
    for (const side of order) {
      if (side === 'def' && defIdx + 1 < physArr.length && physArr[defIdx + 1] > physArr[defIdx]) { defIdx++; leftover -= step; improved = true; break }
      if (side === 'spec' && specIdx + 1 < specArr.length && specArr[specIdx + 1] > specArr[specIdx]) { specIdx++; leftover -= step; improved = true; break }
    }
  }
  cost = defIdx * step + specIdx * step
  return { defPoints: defIdx * step, specPoints: specIdx * step, minProb: Math.min(physArr[defIdx], specArr[specIdx]), cost }
}

function solveSurviveGoalsGeneric(system, { survivalGoals, pokemonData, ivs, nature, userItem, userAbility = '', userStages, battleConditions, availableBudget, minDefPoints = 0 }) {
  const hpBase = pokemonData.stats.find(s => s.stat.name === 'hp').base_stat
  const types = (pokemonData.types || []).map(t => t.type.name)
  const hazardFraction = totalHazardFraction(battleConditions, 'you', userItem, types, userAbility)
  const weather = battleConditions?.weather
  const powerTrickActive = !!battleConditions?.yourPowerTrick
  const flowerGiftActive = !!battleConditions?.yourFlowerGift
  const physicalGoals = survivalGoals.filter(g => g.defKey === 'defense')
  const specialGoals = survivalGoals.filter(g => g.defKey === 'special-defense')
  let best = null
  for (let hpP = 0; hpP <= system.maxPerStat && hpP <= availableBudget; hpP += system.step) {
    const remaining = availableBudget - hpP
    if (minDefPoints > remaining) continue
    const hpStat0 = ownStatAt(system, 'hp', hpBase, ivs, hpP, nature)
    const effectiveHP = currentHpAfterHazards(hpStat0, battleConditions?.yourHpPercent, hazardFraction)
    const physArr = buildDefenseProbArrayGeneric(system, { goals: physicalGoals, pokemonData, ivs, nature, userItem, userStages, weather, hpStat: effectiveHP, hpMaxHp: hpStat0, defKey: 'defense', powerTrickActive, flowerGiftActive })
    const specArr = buildDefenseProbArrayGeneric(system, { goals: specialGoals, pokemonData, ivs, nature, userItem, userStages, weather, hpStat: effectiveHP, hpMaxHp: hpStat0, defKey: 'special-defense', powerTrickActive, flowerGiftActive })
    const { defPoints, specPoints, minProb, cost } = bestJointDefenseAllocation(physArr, specArr, remaining, system.step, minDefPoints / system.step)
    const total = hpP + cost
    if (!best || minProb > best.minProb || (minProb === best.minProb && total < best.totalCost)) {
      best = { hpPoints: hpP, defPoints, specPoints, totalCost: total, minProb }
    }
  }
  return best
}

function achievedMinProb(s, survivalGoals, level) {
  let minProb = 1
  for (const g of survivalGoals) {
    const [raw, stage] = s.rawStage(g)
    const prob = nHitSurvivalProbability(paramsFromDescriptor(g, level, defStatFor(g, raw, stage), raw, stage), s.hpStat, g.hits ?? 1, { ...g.sustain, maxHp: s.hpMax })
    minProb = Math.min(minProb, prob)
  }
  return minProb
}

function trimSurviveAllocationGeneric(system, { hpPoints, defPoints, specPoints, survivalGoals, pokemonData, ivs, nature, userItem, userAbility = '', userStages, battleConditions, minDefPoints = 0 }) {
  const hpBase = pokemonData.stats.find(s => s.stat.name === 'hp').base_stat
  const specBase = pokemonData.stats.find(s => s.stat.name === 'special-defense').base_stat
  const types = (pokemonData.types || []).map(t => t.type.name)
  const hazardFraction = totalHazardFraction(battleConditions, 'you', userItem, types, userAbility)
  const weather = battleConditions?.weather
  const powerTrickActive = !!battleConditions?.yourPowerTrick
  const flowerGiftActive = !!battleConditions?.yourFlowerGift
  const defLookupKey = powerTrickSwap('defense', powerTrickActive)
  const defBase = pokemonData.stats.find(s => s.stat.name === defLookupKey).base_stat

  function computeStats(hp, def, spec) {
    const hpRaw = ownStatAt(system, 'hp', hpBase, ivs, hp, nature)
    const hpStat = currentHpAfterHazards(hpRaw, battleConditions?.yourHpPercent, hazardFraction)
    const defRaw = ownStatAt(system, 'defense', defBase, ivs, def, nature)
    const specRaw = ownStatAt(system, 'special-defense', specBase, ivs, spec, nature)
    const stageD = userStages?.defense ?? 0, stageS = userStages?.['special-defense'] ?? 0
    // Raw stat + stage for a specific incoming hit; the descriptor supplies the multipliers, crit and Unaware rules.
    const rawStage = (g) => g.defKey === 'defense' ? [defRaw, stageD] : [specRaw, stageS]
    return { hpStat, hpMax: hpRaw, rawStage }
  }

  const s0 = computeStats(hpPoints, defPoints, specPoints)
  const target = achievedMinProb(s0, survivalGoals, system.level)

  let hp = hpPoints, def = defPoints, spec = specPoints, changed = true
  const step = system.step
  while (changed) {
    changed = false
    if (hp >= step) {
      const s = computeStats(hp - step, def, spec)
      if (achievedMinProb(s, survivalGoals, system.level) >= target) { hp -= step; changed = true; continue }
    }
    if (def - step >= minDefPoints) {
      const s = computeStats(hp, def - step, spec)
      if (achievedMinProb(s, survivalGoals, system.level) >= target) { def -= step; changed = true; continue }
    }
    if (spec >= step) {
      const s = computeStats(hp, def, spec - step)
      if (achievedMinProb(s, survivalGoals, system.level) >= target) { spec -= step; changed = true; continue }
    }
  }
  return { hpPoints: hp, defPoints: def, specPoints: spec, minProb: target, totalCost: hp + def + spec }
}

function finalizeSpreadGeneric(system, pokemonData, ivs, best, userMoveCategories, satisfiedIds, unsatisfiedIds, goals, survivalGoalsForFinalize, investInOffense = true, investInSpeed = true, battleConditions = {}, userItem = '', userAbility = '', userStatStages = {}) {
  const statusCount = userMoveCategories.filter(c => c === 'status').length
  const heavyStatus = statusCount >= 3
  const offensiveKey = goalDrivenOffensiveStat(goals, userMoveCategories, pokemonData)
  const natureName = best.natureName ?? (
    heavyStatus ? (battleConditions?.trickRoom ? 'Relaxed' : 'Bold') :
    (investInSpeed && !battleConditions?.trickRoom) ? (offensiveKey === 'special-attack' ? 'Timid' : 'Jolly') :
    investInOffense ? (battleConditions?.trickRoom ? (offensiveKey === 'special-attack' ? 'Quiet' : 'Brave') : (offensiveKey === 'special-attack' ? 'Modest' : 'Adamant')) :
    (battleConditions?.trickRoom ? 'Relaxed' : 'Bold')
  )
  const pointsNeeded = best.pointsNeeded ? { ...best.pointsNeeded } : Object.fromEntries(STAT_KEYS.map(k => [k, 0]))
  let leftover = system.totalBudget - totalEVs(pointsNeeded)

  const types = (pokemonData.types || []).map(t => t.type.name)
  const hazardFraction = totalHazardFraction(battleConditions, 'you', userItem, types, userAbility)
  const powerTrickActive = !!battleConditions?.yourPowerTrick
  const flowerGiftActive = !!battleConditions?.yourFlowerGift
  const weather = battleConditions?.weather

  // Priority 0: goal chance always comes first. Try to rescue or improve any outspeed
  // goals that missed the winning subset, using leftover speed — before any toggle-gated dump.
  const unsatisfiedOutspeedGoals = goals.filter(g => g.type === 'outspeed' && unsatisfiedIds.includes(g.id) && !speedOrderInfo(g, userItem, userAbility).decided)
  if (leftover > 0 && unsatisfiedOutspeedGoals.length > 0) {
    const speedBase = pokemonData.stats.find(s => s.stat.name === 'speed').base_stat
    const yourSpeedMult = effectiveSpeedMultiplier(userItem, userAbility, weather, battleConditions.yourTailwind, battleConditions.yourStatus, battleConditions?.terrain)
    const speedStage = userStatStages.speed ?? 0
    const trickRoom = !!battleConditions.trickRoom

    function speedChanceSum(points) {
      const raw = ownStatAt(system, 'speed', speedBase, ivs, points, natureName)
      const yourSpeed = Math.floor(applyStage(raw, speedStage) * yourSpeedMult)
      let sum = 0
      for (const g of unsatisfiedOutspeedGoals) {
        const theirSpeed = speedTargetForGoalsGeneric(system, [g], battleConditions)
        if (theirSpeed == null) continue
        sum += outspeedChance(yourSpeed, theirSpeed, trickRoom)
      }
      return sum
    }

    let bestPoints = pointsNeeded.speed
    let bestSum = speedChanceSum(pointsNeeded.speed)
    for (let add = system.step; add <= leftover; add += system.step) {
      const candidate = pointsNeeded.speed + add
      if (candidate > system.maxPerStat) break
      const sum = speedChanceSum(candidate)
      if (sum > bestSum) { bestSum = sum; bestPoints = candidate }
    }
    if (bestPoints > pointsNeeded.speed) {
      leftover -= (bestPoints - pointsNeeded.speed)
      pointsNeeded.speed = bestPoints
    }
  }

  const hpBase = pokemonData.stats.find(s => s.stat.name === 'hp').base_stat
  const defLookupKey = powerTrickSwap('defense', powerTrickActive)
  const defBase = pokemonData.stats.find(s => s.stat.name === defLookupKey).base_stat
  const specBase = pokemonData.stats.find(s => s.stat.name === 'special-defense').base_stat

  // Priority 1: goal chance always comes first. Maximize the worst-case (minimum) survival
  // chance, then keep spending leftover to raise ANY goal's chance (sum of chances) —
  // not just stopping once the bottleneck goal can't be pushed further.
  if (leftover > 0 && survivalGoalsForFinalize.length > 0) {
    function probsAt(hp, def, spec) {
      const hpRaw = ownStatAt(system, 'hp', hpBase, ivs, hp, natureName)
      const hpMaxHp = hpRaw
      const hpStat = currentHpAfterHazards(hpRaw, battleConditions?.yourHpPercent, hazardFraction)
      const defRaw = ownStatAt(system, 'defense', defBase, ivs, def, natureName)
      const specRaw = ownStatAt(system, 'special-defense', specBase, ivs, spec, natureName)
      return survivalGoalsForFinalize.map(g => {
        const raw = g.defKey === 'defense' ? defRaw : specRaw
        const stage = userStatStages?.[g.defKey] ?? 0
        return nHitSurvivalProbability(paramsFromDescriptor(g, system.level, defStatFor(g, raw, stage), raw, stage), hpStat, g.hits ?? 1, { ...g.sustain, maxHp: hpMaxHp })
      })
    }
    function summarize(hp, def, spec) {
      const probs = probsAt(hp, def, spec)
      return { minProb: Math.min(...probs), sumProb: probs.reduce((a, b) => a + b, 0) }
    }

    const maxPossibleSum = survivalGoalsForFinalize.length
    const starting = summarize(pointsNeeded.hp, pointsNeeded.defense, pointsNeeded['special-defense'])

    if (starting.sumProb < maxPossibleSum) {
      let bestCombo = { dHp: 0, dDef: 0, dSpec: 0, minProb: starting.minProb, sumProb: starting.sumProb }
      for (let dHp = 0; dHp <= leftover; dHp += system.step) {
        if (pointsNeeded.hp + dHp > system.maxPerStat) continue
        const remAfterHp = leftover - dHp
        for (let dDef = 0; dDef <= remAfterHp; dDef += system.step) {
          if (pointsNeeded.defense + dDef > system.maxPerStat) continue
          const dSpec = remAfterHp - dDef
          if (pointsNeeded['special-defense'] + dSpec > system.maxPerStat) continue
          const { minProb, sumProb } = summarize(pointsNeeded.hp + dHp, pointsNeeded.defense + dDef, pointsNeeded['special-defense'] + dSpec)
          const cost = dHp + dDef + dSpec
          const bestCost = bestCombo.dHp + bestCombo.dDef + bestCombo.dSpec
          const better =
            minProb > bestCombo.minProb ||
            (minProb === bestCombo.minProb && sumProb > bestCombo.sumProb) ||
            (minProb === bestCombo.minProb && sumProb === bestCombo.sumProb && cost < bestCost)
          if (better) bestCombo = { dHp, dDef, dSpec, minProb, sumProb }
        }
      }
      let dHp = bestCombo.dHp, dDef = bestCombo.dDef, dSpec = bestCombo.dSpec
      const achievedMin = bestCombo.minProb, achievedSum = bestCombo.sumProb
      let trimmed = true
      while (trimmed) {
        trimmed = false
        if (dSpec >= system.step) {
          const { minProb, sumProb } = summarize(pointsNeeded.hp + dHp, pointsNeeded.defense + dDef, pointsNeeded['special-defense'] + dSpec - system.step)
          if (minProb >= achievedMin && sumProb >= achievedSum - 1e-9) { dSpec -= system.step; trimmed = true; continue }
        }
        if (dDef >= system.step) {
          const { minProb, sumProb } = summarize(pointsNeeded.hp + dHp, pointsNeeded.defense + dDef - system.step, pointsNeeded['special-defense'] + dSpec)
          if (minProb >= achievedMin && sumProb >= achievedSum - 1e-9) { dDef -= system.step; trimmed = true; continue }
        }
        if (dHp >= system.step) {
          const { minProb, sumProb } = summarize(pointsNeeded.hp + dHp - system.step, pointsNeeded.defense + dDef, pointsNeeded['special-defense'] + dSpec)
          if (minProb >= achievedMin && sumProb >= achievedSum - 1e-9) { dHp -= system.step; trimmed = true; continue }
        }
      }
      pointsNeeded.hp += dHp
      pointsNeeded.defense += dDef
      pointsNeeded['special-defense'] += dSpec
      leftover -= (dHp + dDef + dSpec)
    }
  }

  // Priority 2: whatever's left goes to offense, IF the toggle is on.
  const foulPlaySurvive = goals.some(g => g.type === 'survive' && g.moveName === 'foul-play')
  // If Foul Play is your only physical move, your own Attack stat is worthless — don't dump EVs there.
  // Fixed-damage moves (Seismic Toss, Super Fang...) don't scale with your offenses either.
  const nonScaling = userMoveCategories.includes('foul-play') || userMoveCategories.includes('fixed-damage')
  const foulPlayOnlyPhysical = nonScaling && !userMoveCategories.includes('physical')
  const noScalingMoves = nonScaling && !userMoveCategories.includes('physical') && !userMoveCategories.includes('special')
  if (!heavyStatus && investInOffense && leftover > 0 && !noScalingMoves && !((foulPlaySurvive || foulPlayOnlyPhysical) && offensiveKey === 'attack')) {
    const add = Math.max(0, Math.min(system.maxPerStat - pointsNeeded[offensiveKey], leftover))
    const rounded = add - (add % system.step)
    pointsNeeded[offensiveKey] += rounded
    leftover -= rounded
  }

  // Priority 3: Speed, IF the toggle is on.
  if (!heavyStatus && investInSpeed && !battleConditions?.trickRoom && leftover > 0) {
    const add = Math.max(0, Math.min(system.maxPerStat - pointsNeeded.speed, leftover))
    const rounded = add - (add % system.step)
    pointsNeeded.speed += rounded
    leftover -= rounded
  }

  // Priority 4: whatever's STILL left → harm-minimized bulk.
  if (leftover > 0) {
    const step = system.step
    const usableLeftover = leftover - (leftover % step)
    let bestCombo = null
    for (let dHp = 0; dHp <= usableLeftover; dHp += step) {
      if (pointsNeeded.hp + dHp > system.maxPerStat) continue
      const afterHp = usableLeftover - dHp
      for (let dDef = 0; dDef <= afterHp; dDef += step) {
        if (pointsNeeded.defense + dDef > system.maxPerStat) continue
        const dSpDef = afterHp - dDef
        if (pointsNeeded['special-defense'] + dSpDef > system.maxPerStat) continue
        const H = ownStatAt(system, 'hp', hpBase, ivs, pointsNeeded.hp + dHp, natureName)
        const D = ownStatAt(system, 'defense', defBase, ivs, pointsNeeded.defense + dDef, natureName)
        const S = ownStatAt(system, 'special-defense', specBase, ivs, pointsNeeded['special-defense'] + dSpDef, natureName)
        const harm = overallHarm(D, S, H)
        if (!bestCombo || harm < bestCombo.harm) bestCombo = { dHp, dDef, dSpDef, harm }
      }
    }
    if (bestCombo) {
      pointsNeeded.hp += bestCombo.dHp
      pointsNeeded.defense += bestCombo.dDef
      pointsNeeded['special-defense'] += bestCombo.dSpDef
    }
  }
  return { natureName, pointsNeeded, totalCost: totalEVs(pointsNeeded), satisfiedIds, unsatisfiedIds }
}

function runOptimizerCore(system, pokemonData, ivs, goals, userMoveCategories, userItem, userAbility, battleConditions, gameFormat, userStatStages, investInOffense = true, investInSpeed = true) {
  const magicRoomActive = !!battleConditions.magicRoom
  const effectiveUserItem = magicRoomActive ? '' : userItem

  // Moves like Crush Grip / Wring Out / Flail / Low Kick / Gyro Ball have power: null in PokeAPI, so
  // validity checks look at the RESOLVED power (effective*) first and only fall back to the raw one.
  const validGoals = goals.filter(g => {
    if (g.type === 'outspeed') return g.opponentBaseSpeed != null
    if (g.type === 'survive') return ((g.effectiveMovePower ?? g.movePower) || g.effectiveMoveSpecial) && g.moveOffKey && g.moveDefKey && g.opponentAttackBase != null
    if (g.type === 'ko') return ((g.effectiveKoMovePower ?? g.koMovePower) || g.effectiveKoMoveSpecial) && g.koMoveOffKey && g.koMoveDefKey && g.opponentDefBase != null && g.opponentHPBase != null && (g.koMoveName !== 'foul-play' || g.opponentAtkBase != null)
    return false
  }).map(g => ({
    ...g,
    userAbility,
    userItem: effectiveUserItem,
    userCanEvolve: pokemonData.canEvolve,
    opponentItem: magicRoomActive ? '' : g.opponentItem,
    userTypesList: (pokemonData.types || []).map(t => t.type.name),
    opponentTypesList: g.opponentTypes ?? []
  }))

  if (validGoals.length === 0) {
    return finalizeSpreadGeneric(system, pokemonData, ivs, {}, userMoveCategories, [], [], [], [], investInOffense, investInSpeed, battleConditions, effectiveUserItem, userAbility, userStatStages)
  }

  const outspeedGoalsAll = validGoals.filter(g => g.type === 'outspeed')
  // Priority (or a move-last item) can settle an outspeed goal regardless of Speed: those never need Speed EVs.
  const orderOf = (g) => speedOrderInfo(g, effectiveUserItem, userAbility)
  const outspeedGoals = outspeedGoalsAll.filter(g => !orderOf(g).decided)
  const decidedWinIds = outspeedGoalsAll.filter(g => orderOf(g).decided === 'win').map(g => g.id)
  const surviveGoalsRaw = validGoals.filter(g => g.type === 'survive')
  const koGoalsRaw = validGoals.filter(g => g.type === 'ko')

  const n = outspeedGoals.length
  let bestSubset = null

  for (let size = n; size >= 0; size--) {
    let sizeWinner = null
    for (let mask = 0; mask < (1 << n); mask++) {
      if (popcount(mask) !== size) continue
      const subsetOutspeed = outspeedGoals.filter((_, i) => (mask & (1 << i)) !== 0)
      const speedTarget = speedTargetForGoalsGeneric(system, subsetOutspeed, battleConditions)
      const trickRoom = !!battleConditions.trickRoom

      for (const natureName of Object.keys(NATURES)) {
        let pointsNeeded = Object.fromEntries(STAT_KEYS.map(k => [k, 0]))
        let cost = 0, ok = true, minProb = 1

        if (speedTarget) {
          const speedBase = pokemonData.stats.find(s => s.stat.name === 'speed').base_stat
          const yourSpeedMult = effectiveSpeedMultiplier(effectiveUserItem, userAbility, battleConditions.weather, battleConditions.yourTailwind, battleConditions.yourStatus, battleConditions?.terrain)
          const speedStage = userStatStages.speed ?? 0

          if (trickRoom) {
            const rawBaseline = ownStatAt(system, 'speed', speedBase, ivs, 0, natureName)
            const baseline = Math.floor(applyStage(rawBaseline, speedStage) * yourSpeedMult)
            if (baseline > speedTarget) ok = false
            else minProb = Math.min(minProb, outspeedChance(baseline, speedTarget, true))
          } else {
            const rawMax = ownStatAt(system, 'speed', speedBase, ivs, system.maxPerStat, natureName)
            const maxSpeed = Math.floor(applyStage(rawMax, speedStage) * yourSpeedMult)
            const bestChance = outspeedChance(maxSpeed, speedTarget, false)

            let found = 0, foundChance = outspeedChance(
              Math.floor(applyStage(ownStatAt(system, 'speed', speedBase, ivs, 0, natureName), speedStage) * yourSpeedMult),
              speedTarget, false
            )
            for (let p = 0; p <= system.maxPerStat; p += system.step) {
              const raw = ownStatAt(system, 'speed', speedBase, ivs, p, natureName)
              const yourSpeed = Math.floor(applyStage(raw, speedStage) * yourSpeedMult)
              const chance = outspeedChance(yourSpeed, speedTarget, false)
              if (chance >= bestChance) { found = p; foundChance = chance; break }
            }
            pointsNeeded.speed = found
            cost += found
            minProb = Math.min(minProb, foundChance)
          }
        }
        let koSolved = null
        if (ok && koGoalsRaw.length > 0) {
          koSolved = genericKoRequirementForNature(system, koGoalsRaw, natureName, pokemonData, ivs, effectiveUserItem, userAbility, userStatStages, battleConditions, gameFormat)
        }
        const minDef = koSolved?.def ?? 0
        // Rebuilt per nature: an opposing Foul Play uses YOUR Attack, which depends on nature + Attack investment.
        const ownAtkForFoulPlay = ownAttackStatFor(system, pokemonData, ivs, koSolved?.atk ?? 0, natureName, userStatStages)
        const surviveGoals = surviveGoalsRaw.map(g => genericToSurviveDescriptor(system, g, battleConditions, gameFormat, ownAtkForFoulPlay))

        if (ok && surviveGoals.length > 0) {
          const solved = solveSurviveGoalsGeneric(system, {
            survivalGoals: surviveGoals, pokemonData, ivs, nature: natureName, userItem: effectiveUserItem, userAbility,
            userStages: userStatStages, battleConditions, availableBudget: system.totalBudget - cost, minDefPoints: minDef
          })
          if (!solved) {
            ok = false
          } else {
            const trimmed = trimSurviveAllocationGeneric(system, {
              hpPoints: solved.hpPoints, defPoints: solved.defPoints, specPoints: solved.specPoints,
              survivalGoals: surviveGoals, pokemonData, ivs, nature: natureName, userItem: effectiveUserItem, userAbility,
              userStages: userStatStages, battleConditions, minDefPoints: minDef
            })
            pointsNeeded.hp = trimmed.hpPoints; pointsNeeded.defense = trimmed.defPoints; pointsNeeded['special-defense'] = trimmed.specPoints
            cost += trimmed.totalCost
            minProb = Math.min(minProb, trimmed.minProb)
          }
        } else if (ok && minDef > 0) {
          pointsNeeded.defense = minDef
          cost += minDef
        }
        if (ok && koSolved) {
          pointsNeeded.attack = koSolved.atk; pointsNeeded['special-attack'] = koSolved.spAtk
          cost += koSolved.atk + koSolved.spAtk
          minProb = Math.min(minProb, koSolved.minProb)
        }
        if (!ok || cost > system.totalBudget) continue

        const usedOffense = goalDrivenOffensiveStat(validGoals, userMoveCategories, pokemonData)
        const unused = unusedOffensiveStat(validGoals, userMoveCategories, pokemonData)
        const boostsUsed = NATURES[natureName]?.plus === usedOffense
        const lowersUnused = usedOffense === 'defense'
          ? (natureLowers(natureName, 'attack') || natureLowers(natureName, 'special-attack'))
          : natureLowers(natureName, unused)
        const rank = (investInOffense ? ((boostsUsed ? 2 : 0) + (lowersUnused ? 1 : 0)) : 0)
          + (battleConditions.trickRoom && natureLowers(natureName, 'speed') ? 1.5 : 0) // Trick Room: lower Speed is better

        const isBetter =
          !sizeWinner ||
          minProb > sizeWinner.minProb ||
          (minProb === sizeWinner.minProb && (cost < sizeWinner.cost || (cost === sizeWinner.cost && rank > sizeWinner.rank)))

        if (isBetter) {
          sizeWinner = {
            cost, pointsNeeded, natureName, rank, minProb,
            satisfiedIds: [...subsetOutspeed.map(g => g.id), ...decidedWinIds, ...surviveGoalsRaw.map(g => g.id), ...koGoalsRaw.map(g => g.id)]
          }
        }
      }
    }
    if (sizeWinner) { bestSubset = { size, ...sizeWinner }; break }
  }

  if (!bestSubset) return null // no nature / goal combination fits the budget
  const unsatisfiedIds = outspeedGoalsAll.filter(g => !bestSubset.satisfiedIds.includes(g.id)).map(g => g.id)
  const finalOwnAtk = ownAttackStatFor(system, pokemonData, ivs, bestSubset.pointsNeeded.attack ?? 0, bestSubset.natureName, userStatStages)
  const survivalGoalsForFinalize = surviveGoalsRaw.map(g => genericToSurviveDescriptor(system, g, battleConditions, gameFormat, finalOwnAtk))
  return finalizeSpreadGeneric(system, pokemonData, ivs, bestSubset, userMoveCategories, bestSubset.satisfiedIds, unsatisfiedIds, validGoals, survivalGoalsForFinalize, investInOffense, investInSpeed, battleConditions, effectiveUserItem, userAbility, userStatStages)
}

// IVs the optimizer is allowed to drop to 0 (EV mode only — Champions has no IVs). Everything else stays as given.
//  - Attack: when you have no physical moves and are facing a Foul Play survive goal (it uses YOUR Attack).
//  - Speed: in Trick Room, where lower Speed is better.
export function chooseIvOverrides(goals, userMoveCategories, battleConditions) {
  const overrides = {}
  const moves = (userMoveCategories || []).filter(Boolean)
  const noPhysicalMoves = moves.length > 0 && !moves.includes('physical')
  const facesFoulPlay = (goals || []).some(g => g.type === 'survive' && g.moveName === 'foul-play')
  // Power Trick swaps Attack/Defense, so leave Attack alone there.
  if (noPhysicalMoves && facesFoulPlay && !battleConditions?.yourPowerTrick) overrides.attack = 0
  if (battleConditions?.trickRoom) overrides.speed = 0
  return overrides
}

export function runOptimizer(pokemonData, ivs, level, goals, userMoveCategories = [], userItem = '', userAbility = '', battleConditions = {}, gameFormat = 'singles', userStatStages = {}, investInOffense = true, investInSpeed = true) {
  const ivOverrides = chooseIvOverrides(goals, userMoveCategories, battleConditions)
  const effectiveIvs = { ...ivs, ...ivOverrides }
  const r = runOptimizerCore(evSystem(level), pokemonData, effectiveIvs, goals, userMoveCategories, userItem, userAbility, battleConditions, gameFormat, userStatStages, investInOffense, investInSpeed)
  if (!r) return { infeasible: true }
  return { natureName: r.natureName, evsNeeded: r.pointsNeeded, ivs: effectiveIvs, ivOverrides, totalCost: r.totalCost, satisfiedIds: r.satisfiedIds, unsatisfiedIds: r.unsatisfiedIds }
}
export function runOptimizerChampions(pokemonData, goals, userMoveCategories = [], userItem = '', userAbility = '', battleConditions = {}, gameFormat = 'singles', userStatStages = {}, investInOffense = true, investInSpeed = true) {
  const r = runOptimizerCore(spSystem(), pokemonData, {}, goals, userMoveCategories, userItem, userAbility, battleConditions, gameFormat, userStatStages, investInOffense, investInSpeed)
  if (!r) return { infeasible: true }
  return { natureName: r.natureName, spNeeded: r.pointsNeeded, totalCost: r.totalCost, satisfiedIds: r.satisfiedIds, unsatisfiedIds: r.unsatisfiedIds }
}

// --- Postview (generic core + thin public wrappers matching original call signatures) ---
function evaluateOutspeedGoalGeneric(system, g, result, pokemonData, ivs, userItem, userAbility, userStatStages, battleConditions) {
  const base = pokemonData.stats.find(s => s.stat.name === 'speed').base_stat
  const pts = system.isChampions ? result.spNeeded.speed : result.evsNeeded.speed
  const raw = ownStatAt(system, 'speed', base, ivs, pts, result.natureName)
  const staged = applyStage(raw, userStatStages.speed ?? 0)
  const yourSpeed = Math.floor(staged * effectiveSpeedMultiplier(userItem, userAbility, battleConditions.weather, battleConditions.yourTailwind, battleConditions.yourStatus, battleConditions?.terrain))
  const theirSpeed = speedTargetForGoalsGeneric(system, [g], battleConditions)
  const trickRoom = !!battleConditions.trickRoom
  const order = speedOrderInfo(g, userItem, userAbility)
  if (order.decided) {
    // Lagging Tail / Stall settles it — Speed doesn't matter.
    const win = order.decided === 'win'
    return { type: 'outspeed', opponentName: g.opponentName, yourSpeed, theirSpeed, outcome: win, trickRoom, chance: win ? 1 : 0, tie: false,
      orderDecided: order.decided }
  }
  const chance = outspeedChance(yourSpeed, theirSpeed, trickRoom, { yourFirst: order.yourFirst, theirFirst: order.theirFirst })
  const outsped = trickRoom ? yourSpeed < theirSpeed : yourSpeed > theirSpeed
  return { type: 'outspeed', opponentName: g.opponentName, yourSpeed, theirSpeed, outcome: outsped, trickRoom, chance, tie: yourSpeed === theirSpeed,
    quickClaw: order.yourFirst > 0 || order.theirFirst > 0, yourFirst: order.yourFirst, theirFirst: order.theirFirst }
}

function evaluateSurviveGoalGeneric(system, g, result, pokemonData, ivs, userItem, userAbility, userStatStages, battleConditions, gameFormat) {
  const ownAtkForFoulPlay = ownAttackStatFor(system, pokemonData, ivs, system.isChampions ? result.spNeeded.attack : result.evsNeeded.attack, result.natureName, userStatStages)
  const desc = genericToSurviveDescriptor(system, { ...g, userAbility, userItem, userCanEvolve: pokemonData.canEvolve, userTypesList: (pokemonData.types || []).map(t => t.type.name) }, battleConditions, gameFormat, ownAtkForFoulPlay)
  const base = pokemonData.stats.find(s => s.stat.name === desc.defKey).base_stat
  const pts = system.isChampions ? result.spNeeded[desc.defKey] : result.evsNeeded[desc.defKey]
  const raw = ownStatAt(system, desc.defKey, base, ivs, pts, result.natureName)
  const stage = userStatStages[desc.defKey] ?? 0
  const types = (pokemonData.types || []).map(t => t.type.name)
  const defenseStat = defStatFor(desc, raw, stage)

  const hpBase = pokemonData.stats.find(s => s.stat.name === 'hp').base_stat
  const hpPts = system.isChampions ? result.spNeeded.hp : result.evsNeeded.hp
  const hpMax = ownStatAt(system, 'hp', hpBase, ivs, hpPts, result.natureName)
  const hpStat = currentHpAfterHazards(hpMax, battleConditions?.yourHpPercent, totalHazardFraction(battleConditions, 'you', userItem, types, userAbility))

  const sustain = { ...desc.sustain, maxHp: hpMax }
  const firstHitMult = desc.special ? 1 : desc.sustain.firstHitMultiplier
  const params = paramsFromDescriptor(desc, system.level, defenseStat, raw, stage)
  const calc = calculateDamage({ ...params, currentHp: hpStat, firstHitMultiplier: firstHitMult })
  const survivalChance = nHitSurvivalProbability(params, hpStat, desc.hits, sustain)

  const hitCount = g.moveHitCount ?? 1
  // One row per possible number of hits (Bullet Seed 2-5, Triple Axel 1-3, ...).
  let breakdown = null
  const counts = hitCountOptions(g.moveName)
  if (!desc.special && counts.length > 1) {
    breakdown = counts.map(n => {
      const p = { ...params, hitSpecs: scaleHitSpecPowers(buildHitSpecs(g.moveName, n, g.effectiveMovePower ?? g.movePower, false), desc.powerChain ?? 4096) }
      const c = calculateDamage({ ...p, currentHp: hpStat, firstHitMultiplier: firstHitMult })
      return {
        hits: n, min: c.min, max: c.max,
        minPct: hpStat > 0 ? (c.min / hpStat) * 100 : 0, maxPct: hpStat > 0 ? (c.max / hpStat) * 100 : 0,
        chance: nHitSurvivalProbability(p, hpStat, desc.hits, sustain), isCurrent: n === hitCount
      }
    })
  }
  const common = {
    type: 'survive', opponentName: g.opponentName, moveName: g.moveName, hpStat, hits: desc.hits,
    critical: desc.isCrit, hitCount, parentalBond: !!g.moveParentalBond, perHit: calc.perHit,
    special: desc.special ? desc.special.kind : null,
    immune: desc.special ? !!desc.special.immune : desc.typeMultiplier === 0,
    endure: desc.sustain.endure, guard: desc.sustain.guard?.kind ?? null,
    boostEffects: desc.sustain.onHit?.length ? desc.sustain.onHit : null,
    breakdown
  }
  if (!!battleConditions?.yourProtect) {
    return { ...common, min: 0, max: 0, minPct: 0, maxPct: 0, outcome: true, survivalChance: 1, chance: 1, protectedTurn: true }
  }
  return {
    ...common, min: calc.min, max: calc.max,
    minPct: hpStat > 0 ? (calc.min / hpStat) * 100 : 0, maxPct: hpStat > 0 ? (calc.max / hpStat) * 100 : 0,
    outcome: calc.max < hpStat || survivalChance >= 1, survivalChance, chance: survivalChance
  }
}

function evaluateKoGoalGeneric(system, g, result, pokemonData, ivs, userItem, userAbility, userStatStages, battleConditions, gameFormat) {
  const userTypes = (pokemonData.types ?? []).map(t => t.type.name)
  const c = koGoalContext(system, g, { userAbility, userItem, userTypes }, battleConditions, gameFormat)
  const offKey = c.offKey

  const base = pokemonData.stats.find(s => s.stat.name === offKey).base_stat
  const pts = system.isChampions ? result.spNeeded[offKey] : result.evsNeeded[offKey]
  const raw = ownStatAt(system, offKey, base, ivs, pts, result.natureName)
  let staged
  if (c.fixedAttack != null) {
    // Foul Play: the TARGET's Attack stat and stages; Unaware never ignores them.
    staged = c.fixedAttack
  } else {
    staged = c.ignoreAttackStages ? raw : applyStage(raw, critOffStage(clampStage(userStatStages[offKey] ?? 0), c.isCrit))
  }
  const abilityMult = abilityStatMultiplier(userAbility, offKey, battleConditions.weather, battleConditions.yourStatus, battleConditions?.terrain)
  const fgMult = flowerGiftMultiplier(!!battleConditions?.yourFlowerGift, battleConditions?.weather, offKey)
  const attackStat = Math.floor(staged * offenseItemMultiplier(userItem, offKey, c.moveTypeName, pokemonData.name) * abilityMult * fgMult
    * ruinStatMultiplier(offKey, userAbility, g.opponentAbility)
    * defenseAsOffenseMultiplier(offKey, userItem, battleConditions.weather, userTypes, pokemonData.canEvolve))

  const { oppHP, special, typeMultiplier } = c
  const koMoveName = c.moveName
  const hitCount = g.koMoveHitCount ?? 1
  const hits = c.hits
  const firstHitMult = special ? 1 : c.sustain.firstHitMultiplier
  const sustain = c.sustain
  const params = {
    level: system.level, power: c.power, attackStat, defenseStat: c.defenseStat, defenseByBoost: c.defenseByBoost, stab: c.stab,
    stabMultiplier: c.stabMultiplier, typeMultiplier, extraMultiplier: c.extraMultiplier,
    hitSpecs: c.hitSpecs, critMultiplier: c.critMultiplier, special
  }
  const calc = calculateDamage({ ...params, currentHp: oppHP, firstHitMultiplier: firstHitMult })
  const koChance = nHitKoProbability(params, oppHP, hits, sustain)

  // One row per possible number of hits (Bullet Seed 2-5, Triple Axel 1-3, ...).
  let breakdown = null
  const counts = hitCountOptions(koMoveName)
  if (!special && counts.length > 1) {
    breakdown = counts.map(n => {
      const p = { ...params, hitSpecs: scaleHitSpecPowers(buildHitSpecs(koMoveName, n, c.basePowerForSpecs ?? c.power, false), c.powerChain ?? 4096) }
      const cc = calculateDamage({ ...p, currentHp: oppHP, firstHitMultiplier: firstHitMult })
      return {
        hits: n, min: cc.min, max: cc.max,
        minPct: oppHP > 0 ? (cc.min / oppHP) * 100 : 0, maxPct: oppHP > 0 ? (cc.max / oppHP) * 100 : 0,
        chance: nHitKoProbability(p, oppHP, hits, sustain), isCurrent: n === hitCount
      }
    })
  }
  const common = {
    type: 'ko', opponentName: g.opponentName, moveName: koMoveName, oppHP, hits,
    critical: c.isCrit, hitCount, parentalBond: !!g.koMoveParentalBond, perHit: calc.perHit,
    special: special ? special.kind : null,
    immune: special ? !!special.immune : typeMultiplier === 0,
    endure: sustain.endure, guard: sustain.guard?.kind ?? null,
    boostEffects: sustain.onHit?.length ? sustain.onHit : null,
    breakdown
  }
  if (!!battleConditions?.oppProtect) {
    return { ...common, min: 0, max: 0, minPct: 0, maxPct: 0, outcome: false, koChance: 0, chance: 0, protectedTurn: true }
  }
  return {
    ...common, min: calc.min, max: calc.max,
    minPct: oppHP > 0 ? (calc.min / oppHP) * 100 : 0, maxPct: oppHP > 0 ? (calc.max / oppHP) * 100 : 0,
    outcome: calc.min >= oppHP && koChance >= 1, koChance, chance: koChance
  }
}

export function evaluateOutspeedGoal(g, result, pokemonData, ivs, level, userItem, userAbility, userStatStages, battleConditions) {
  return evaluateOutspeedGoalGeneric(evSystem(level), g, result, pokemonData, ivs, userItem, userAbility, userStatStages, battleConditions)
}
export function evaluateSurviveGoal(g, result, pokemonData, ivs, level, userItem, userAbility, userStatStages, battleConditions, gameFormat) {
  return evaluateSurviveGoalGeneric(evSystem(level), g, result, pokemonData, ivs, userItem, userAbility, userStatStages, battleConditions, gameFormat)
}
export function evaluateKoGoal(g, result, pokemonData, ivs, level, userItem, userAbility, userStatStages, battleConditions, gameFormat) {
  return evaluateKoGoalGeneric(evSystem(level), g, result, pokemonData, ivs, userItem, userAbility, userStatStages, battleConditions, gameFormat)
}

function applyMagicRoomToGoal(goal, battleConditions) {
  if (!battleConditions?.magicRoom) return goal
  return { ...goal, opponentItem: '' }
}

export function evaluateAllGoals(goals, result, pokemonData, ivs, level, userItem, userAbility, userStatStages, battleConditions, gameFormat) {
  const magicRoomActive = !!battleConditions.magicRoom
  const effUserItem = magicRoomActive ? '' : userItem
  return goals.map(g => {
    const effGoal = applyMagicRoomToGoal(g, battleConditions)
    try {
      if (effGoal.type === 'outspeed' && effGoal.opponentBaseSpeed != null) return evaluateOutspeedGoal(effGoal, result, pokemonData, ivs, level, effUserItem, userAbility, userStatStages, battleConditions)
      if (effGoal.type === 'survive' && ((effGoal.effectiveMovePower ?? effGoal.movePower) || effGoal.effectiveMoveSpecial)) return evaluateSurviveGoal(effGoal, result, pokemonData, ivs, level, effUserItem, userAbility, userStatStages, battleConditions, gameFormat)
      if (effGoal.type === 'ko' && ((effGoal.effectiveKoMovePower ?? effGoal.koMovePower) || effGoal.effectiveKoMoveSpecial)) return evaluateKoGoal(effGoal, result, pokemonData, ivs, level, effUserItem, userAbility, userStatStages, battleConditions, gameFormat)
    } catch { /* incomplete */ }
    return { type: g.type, opponentName: g.opponentName, incomplete: true }
  })
}

export function evaluateOutspeedGoalChampions(g, result, pokemonData, userItem, userAbility, userStatStages, battleConditions) {
  return evaluateOutspeedGoalGeneric(spSystem(), g, result, pokemonData, {}, userItem, userAbility, userStatStages, battleConditions)
}
export function evaluateSurviveGoalChampions(g, result, pokemonData, userItem, userAbility, userStatStages, battleConditions, gameFormat) {
  return evaluateSurviveGoalGeneric(spSystem(), g, result, pokemonData, {}, userItem, userAbility, userStatStages, battleConditions, gameFormat)
}
export function evaluateKoGoalChampions(g, result, pokemonData, userItem, userAbility, userStatStages, battleConditions, gameFormat) {
  return evaluateKoGoalGeneric(spSystem(), g, result, pokemonData, {}, userItem, userAbility, userStatStages, battleConditions, gameFormat)
}
export function evaluateAllGoalsChampions(goals, result, pokemonData, userItem, userAbility, userStatStages, battleConditions, gameFormat) {
  const magicRoomActive = !!battleConditions.magicRoom
  const effUserItem = magicRoomActive ? '' : userItem
  return goals.map(g => {
    const effGoal = applyMagicRoomToGoal(g, battleConditions)
    try {
      if (effGoal.type === 'outspeed' && effGoal.opponentBaseSpeed != null) return evaluateOutspeedGoalChampions(effGoal, result, pokemonData, effUserItem, userAbility, userStatStages, battleConditions)
      if (effGoal.type === 'survive' && ((effGoal.effectiveMovePower ?? effGoal.movePower) || effGoal.effectiveMoveSpecial)) return evaluateSurviveGoalChampions(effGoal, result, pokemonData, effUserItem, userAbility, userStatStages, battleConditions, gameFormat)
      if (effGoal.type === 'ko' && ((effGoal.effectiveKoMovePower ?? effGoal.koMovePower) || effGoal.effectiveKoMoveSpecial)) return evaluateKoGoalChampions(effGoal, result, pokemonData, effUserItem, userAbility, userStatStages, battleConditions, gameFormat)
    } catch { /* incomplete */ }
    return { type: g.type, opponentName: g.opponentName, incomplete: true }
  })
}

// ============ Weather Ball ============
export function weatherBallEffectivePower(moveName, basePower, weather) {
  if (moveName !== 'weather-ball') return basePower
  const boosted = ['sun', 'harsh-sunshine', 'rain', 'heavy-rain', 'sand', 'snow'].includes(weather)
  return boosted ? 100 : (basePower ?? 50)
}
export function weatherBallEffectiveType(moveName, baseType, weather) {
  if (moveName !== 'weather-ball') return baseType
  if (weather === 'sun' || weather === 'harsh-sunshine') return 'fire'
  if (weather === 'rain' || weather === 'heavy-rain') return 'water'
  if (weather === 'sand') return 'rock'
  if (weather === 'snow') return 'ice'
  return 'normal'
}

// ============ Type-changing abilities (-ate abilities, Normalize, Liquid Voice) ============
export const ATE_ABILITY_TYPES = {
  pixilate: 'fairy', aerilate: 'flying', refrigerate: 'ice', galvanize: 'electric', dragonize: 'dragon'
}
// Moves whose type comes from their own mechanic, so these abilities don't rewrite them.
export const TYPE_CHANGE_EXEMPT_MOVES = new Set([
  'judgment', 'multi-attack', 'natural-gift', 'revelation-dance', 'techno-blast',
  'terrain-pulse', 'weather-ball', 'hidden-power', 'struggle'
])
export const SOUND_MOVES = new Set([
  'alluring-voice', 'boomburst', 'bug-buzz', 'chatter', 'clanging-scales', 'disarming-voice',
  'echoed-voice', 'eerie-spell', 'hyper-voice', 'overdrive', 'psychic-noise', 'relic-song',
  'round', 'snarl', 'snore', 'sparkling-aria', 'torch-song', 'uproar', 'confide', 'screech',
  'growl', 'roar', 'sing', 'supersonic', 'metal-sound', 'grass-whistle', 'noble-roar', 'parting-shot'
])

// Returns the move's type after the user's ability, and whether the 1.2x power boost applies.
export function abilityTypeChange(ability, moveName, moveTypeName) {
  const unchanged = { type: moveTypeName, boosted: false }
  if (!moveTypeName) return unchanged
  const exempt = TYPE_CHANGE_EXEMPT_MOVES.has(moveName)
  if (ability === 'normalize') return { type: exempt ? moveTypeName : 'normal', boosted: true }
  if (exempt) return unchanged
  if (ATE_ABILITY_TYPES[ability] && moveTypeName === 'normal') return { type: ATE_ABILITY_TYPES[ability], boosted: true }
  if (ability === 'liquid-voice' && SOUND_MOVES.has(moveName)) return { type: 'water', boosted: false }
  return unchanged
}

// ============ Variable-power moves ============
// Stored Power / Power Trip: 20 base, +20 per positive stat stage the user currently has (all 6 stats).
export function storedPowerBasePower(statStages) {
  const positiveSum = Object.values(statStages || {}).reduce((sum, v) => sum + Math.max(0, v || 0), 0)
  return 20 + 20 * positiveSum
}
// Low Kick / Grass Knot: power scales with the TARGET's weight in kg.
export function lowKickPower(weightKg) {
  if (weightKg == null) return null
  if (weightKg < 10) return 20
  if (weightKg < 25) return 40
  if (weightKg < 50) return 60
  if (weightKg < 100) return 80
  if (weightKg < 200) return 100
  return 120
}
// Gyro Ball / Electro Ball: power scales with the SPEED ratio between attacker and target.
// APPROXIMATION: uses each side's BASE Speed stat rather than their final in-battle Speed (which
// depends on the EV spread the optimizer is still solving for — a chicken-and-egg problem). This
// means these two moves' power is fixed going into the optimizer rather than reacting to the final
// Speed investment; it's usually close, since base Speed is the dominant term, but double-check if
// your spread pushes Speed far from the "natural" ordering the base stats would suggest.
export function gyroBallPower(attackerBaseSpeed, targetBaseSpeed) {
  if (!attackerBaseSpeed || !targetBaseSpeed) return 25
  return Math.min(150, Math.floor(25 * targetBaseSpeed / attackerBaseSpeed) + 1)
}
export function electroBallPower(attackerBaseSpeed, targetBaseSpeed) {
  if (!attackerBaseSpeed || !targetBaseSpeed) return 40
  const ratio = attackerBaseSpeed / targetBaseSpeed
  if (ratio >= 4) return 150
  if (ratio >= 3) return 120
  if (ratio >= 2) return 80
  if (ratio >= 1) return 60
  return 40
}
// Crush Grip / Wring Out: scales with the TARGET's remaining HP fraction.
export function crushGripPower(hpFraction) { return Math.max(1, Math.floor(120 * hpFraction + 1e-9)) }
// Eruption / Water Spout / Dragon Energy: scales with the ATTACKER's remaining HP fraction.
export function eruptionPower(hpFraction) { return Math.max(1, Math.floor(150 * hpFraction + 1e-9)) }
// Flail / Reversal: stronger the lower the ATTACKER's HP is (48-pixel HP bar breakpoints).
export function flailPower(hpFraction) {
  const pixels = Math.floor(48 * hpFraction + 1e-9)
  if (pixels <= 1) return 200
  if (pixels <= 4) return 150
  if (pixels <= 9) return 100
  if (pixels <= 16) return 80
  if (pixels <= 32) return 40
  return 20
}

// Weight-based moves. Heavy Metal doubles weight, Light Metal / Float Stone halve it.
export function effectiveWeight(weightKg, ability, item) {
  if (weightKg == null) return null
  let w = weightKg
  if (ability === 'heavy-metal') w *= 2
  if (ability === 'light-metal') w *= 0.5
  if (item === 'float-stone') w *= 0.5
  return Math.max(0.1, w)
}
// Heavy Slam / Heat Crash: power from how many times heavier the USER is than the target.
export function heavySlamPower(attackerKg, targetKg) {
  if (attackerKg == null || targetKg == null) return null
  const ratio = attackerKg / targetKg
  if (ratio >= 5) return 120
  if (ratio >= 4) return 100
  if (ratio >= 3) return 80
  if (ratio >= 2) return 60
  return 40
}
// Hard Press: 100 * target's remaining HP fraction (at least 1).
export function hardPressPower(hpFraction) { return Math.max(1, Math.floor(100 * hpFraction + 1e-9)) }
// Punishment: 60 + 20 per positive stat stage on the target (max 200).
export function punishmentPower(targetStages) {
  const positive = Object.values(targetStages || {}).reduce((sum, v) => sum + Math.max(0, v || 0), 0)
  return Math.min(200, 60 + 20 * positive)
}

// One call that resolves a move's final type, power, hit count and special damage: Weather Ball -> ability type
// change (-ate/Normalize/Liquid Voice) -> variable-power moves (Stored Power, Low Kick/Grass Knot, Heavy Slam/Heat
// Crash, Gyro/Electro Ball, HP-based moves, Brine/Hex/Venoshock, Acrobatics, Wake-Up Slap, Punishment, ...) ->
// Facade's status doubling. opts is optional; omitted fields just skip that step (HP percents default to 100).
// Returns { type, power, abilityDamageMultiplier, special, hitCount, parentalBond }.
//   special: null | { kind: 'fixed', amount } | { kind: 'half-current' } | { kind: 'ohko' }
//   hitCount: hits per use (multi-hit moves; 2 for Parental Bond; default 2 / Skill Link max / Loaded Dice 4)
export function resolveEffectiveMove(moveName, baseType, basePower, weather, opts = {}) {
  const {
    attackerAbility, attackerItem = '', attackerStatus, attackerStages, attackerWeightKg, attackerBaseSpeed, attackerLevel = 100,
    targetWeightKg, targetAbility, targetItem = '', targetBaseSpeed, targetStatus, targetStages, targetSwitchingOut = false,
    attackerHpPercent = 100, targetHpPercent = 100, hitCountOverride = null, gameFormat = 'singles', singleTarget = false,
    terrain = 'none', targetGrounded = true, targetDamagedThisTurn = false, movesAfterTarget = false, allyFaintedLastTurn = false, faintedAllies = 0
  } = opts
  const attackerHp = Math.max(0.01, Math.min(1, attackerHpPercent / 100))
  const targetHp = Math.max(0.01, Math.min(1, targetHpPercent / 100))

  const wbType = weatherBallEffectiveType(moveName, baseType, weather)
  const wbPower = weatherBallEffectivePower(moveName, basePower, weather)
  const change = abilityTypeChange(attackerAbility, moveName, wbType)
  let power = wbPower

  if (moveName === 'stored-power' || moveName === 'power-trip') {
    power = storedPowerBasePower(attackerStages)
  } else if (moveName === 'low-kick' || moveName === 'grass-knot') {
    const lk = lowKickPower(effectiveWeight(targetWeightKg, targetAbility, targetItem))
    if (lk != null) power = lk
  } else if (moveName === 'heavy-slam' || moveName === 'heat-crash') {
    const hs = heavySlamPower(effectiveWeight(attackerWeightKg, attackerAbility, attackerItem), effectiveWeight(targetWeightKg, targetAbility, targetItem))
    if (hs != null) power = hs
  } else if (moveName === 'gyro-ball') {
    power = gyroBallPower(attackerBaseSpeed, targetBaseSpeed)
  } else if (moveName === 'electro-ball') {
    power = electroBallPower(attackerBaseSpeed, targetBaseSpeed)
  } else if (moveName === 'crush-grip' || moveName === 'wring-out') {
    power = crushGripPower(targetHp)
  } else if (moveName === 'hard-press') {
    power = hardPressPower(targetHp)
  } else if (moveName === 'eruption' || moveName === 'water-spout' || moveName === 'dragon-energy') {
    power = eruptionPower(attackerHp)
  } else if (moveName === 'flail' || moveName === 'reversal') {
    power = flailPower(attackerHp)
  } else if (moveName === 'brine' && targetHp <= 0.5) {
    power = (basePower ?? 65) * 2
  } else if (moveName === 'hex' && hasMajorStatus(targetStatus)) {
    power = (basePower ?? 65) * 2
  } else if (moveName === 'venoshock' && (targetStatus === 'poison' || targetStatus === 'toxic')) {
    power = (basePower ?? 65) * 2
  } else if (moveName === 'pursuit' && targetSwitchingOut) {
    // Pursuit hits a Pokémon as it switches out, at double power (40 -> 80).
    power = (basePower ?? 40) * 2
  } else if (moveName === 'acrobatics') {
    power = (basePower ?? 55) * (attackerItem ? 1 : 2) // doubles when the user holds no item
  } else if (moveName === 'wake-up-slap' && targetStatus === 'asleep') {
    power = (basePower ?? 70) * 2
  } else if (moveName === 'smelling-salts' && targetStatus === 'paralysis') {
    power = (basePower ?? 70) * 2
  } else if (moveName === 'assurance') {
    power = (basePower ?? 60) * (targetDamagedThisTurn ? 2 : 1) // doubles if the target was already hurt this turn
  } else if (moveName === 'payback') {
    power = (basePower ?? 50) * (movesAfterTarget ? 2 : 1) // doubles if the user moves after the target
  } else if (moveName === 'retaliate') {
    power = (basePower ?? 70) * (allyFaintedLastTurn ? 2 : 1) // doubles if an ally fainted last turn
  } else if (moveName === 'last-respects') {
    power = 50 + 50 * Math.max(0, Math.min(5, Math.floor(faintedAllies || 0))) // +50 per fainted party member
  } else if (moveName === 'rising-voltage') {
    power = (basePower ?? 70) * (terrain === 'electric' && targetGrounded ? 2 : 1) // doubles vs a grounded target on Electric Terrain
  } else if (moveName === 'return' || moveName === 'frustration') {
    power = 102 // max friendship / zero friendship
  } else if (moveName === 'punishment') {
    power = punishmentPower(targetStages)
  }

  // Facade's doubling is a genuine base-power change in-game (70 -> 140), so it's baked in here.
  if (power) power = Math.round(power * facadePowerMultiplier(moveName, attackerStatus))

  // Fixed-damage / half-HP / OHKO moves ignore power entirely.
  const special = specialDamageKind(moveName, attackerLevel)

  // Hits per use: multi-hit moves (override > Skill Link > Loaded Dice > 2) or Parental Bond's second hit.
  const mh = multiHitInfo(moveName)
  const parentalBond = !special && parentalBondApplies(attackerAbility, moveName, gameFormat, singleTarget)
  let hitCount = 1
  if (mh) {
    hitCount = (hitCountOverride != null && hitCountOverride >= mh.min && hitCountOverride <= mh.max)
      ? hitCountOverride
      : defaultHitCount(moveName, attackerAbility, attackerItem)
  } else if (parentalBond) {
    hitCount = 2
  }

  // The -ate abilities / Normalize do NOT change the move's listed base power in-game. They apply
  // a 4915/4096 (~1.2x) multiplier at the same damage-calculation stage as items like Life Orb or
  // Expert Belt. Baking it into "power" as an early rounded integer rounds differently than applying
  // it as a late-stage fractional multiplier and can shift computed min/max damage by a point or two —
  // enough to flip a KO chance at an HP boundary. Returned separately so callers fold it into
  // extraMultiplier at the correct stage.
  return { type: change.type, power, abilityDamageMultiplier: change.boosted ? 4915 / 4096 : 1, special, hitCount, parentalBond }
}