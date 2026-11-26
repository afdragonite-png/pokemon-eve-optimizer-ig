// Exact damage arithmetic, the way Pokémon Showdown's calculator (@smogon/calc, Gen 9) does it.
//
// The game never multiplies damage by a decimal. Every boost is a fraction of 4096 ("5324" = x1.2998), several boosts
// are CHAINED into one number first (c = (c * m + 2048) >> 12), and the result is applied with a special rounding that
// rounds .5 DOWN ("pokeRound"). Using plain decimals instead changes the answer by 1 now and then, which is enough to
// flip a KO at an HP boundary. Everything that touches damage in this app goes through here.
//
// Order of operations for one hit (all integers until the very end):
//   base power  = pokeRound(bp x chain(bpMods))            attack / defense = stage -> pokeRound(stat x chain(at/dfMods))
//   base damage = floor(floor(floor(2L/5+2) x bp x atk / def) / 50) + 2
//   spread, Parental Bond child, weather, crit      (each rounds)
//   per roll r (85..100): floor(base x r / 100) -> STAB -> type effectiveness -> burn -> chain(finalMods)
import { moveFlags } from './moveFlags.js'
import { activeGeneration, snowBoostsIce } from './generation.js'

export const pokeRound = (n) => (n % 1 > 0.5 ? Math.ceil(n) : Math.floor(n))

// chain(mods): each modifier is a number of 4096ths. 4096 = no change.
export function chainMods(mods, lower = 0, upper = Infinity) {
  let m = 4096
  for (const mod of mods) if (mod !== 4096) m = Math.floor((m * mod + 2048) / 4096)
  return Math.max(Math.min(m, upper), lower)
}

// Stat after stat stages: floor(stat x num / den) with the game's integer table (not a decimal like 1.5 or 2/3).
export function stageStat(stat, stage) {
  const s = Math.max(-6, Math.min(6, Math.round(stage || 0)))
  if (activeGeneration() <= 2) { // Gens 1 and 2: a lookup table, the result is kept within 1..999
    const v = s >= 0 ? Math.floor(stat * [1, 1.5, 2, 2.5, 3, 3.5, 4][s]) : Math.floor(stat * [100, 66, 50, 40, 33, 28, 25][-s] / 100)
    return Math.min(999, Math.max(1, v))
  }
  const num = s >= 0 ? 2 + s : 2
  const den = s >= 0 ? 2 : 2 - s
  return Math.floor(stat * num / den)
}

// A stat after its modifier chain (Choice Band, Huge Power, Assault Vest, ...): at least 1.
export function finishStat(value, mods) {
  return Math.max(1, pokeRound(value * chainMods(mods, 410, 131072) / 4096))
}
export function finishPower(power, mods) {
  if (!power) return power
  return Math.max(1, pokeRound(power * chainMods(mods, 41, 2097152) / 4096))
}

export function baseDamageOf(level, power, attack, defense) {
  return Math.floor(Math.floor(Math.floor(Math.floor(2 * level / 5 + 2) * power * attack) / defense) / 50) + 2
}

// Base damage after the steps that come BEFORE the random roll. opts: { spread, pbChild, weather: 4096|6144|2048, crit }
export function adjustBaseDamage(base, { spread = false, pbChild = false, weather = 4096, crit = false } = {}) {
  let b = base
  if (spread) b = pokeRound(b * 3072 / 4096)
  if (pbChild) b = pokeRound(b * (activeGeneration() >= 7 ? 1024 : 2048) / 4096) // Parental Bond's second hit: 25% (Gen 7+) / 50% (Gen 6)
  if (weather !== 4096) b = pokeRound(b * weather / 4096)
  if (crit) b = Math.floor(b * (activeGeneration() >= 6 ? 1.5 : 2)) // crits do x2 in Gen 5 and earlier
  return b
}

// One roll (i = 0..15 for 85%..100%). stabMod / finalMod are 4096ths; typeEff is the plain 0 / .25 / .5 / 1 / 2 / 4.
export function rollDamage(base, i, { stabMod = 4096, typeEff = 1, burn = false, finalMod = 4096 }) {
  let d = Math.floor(base * (85 + i) / 100)
  if (stabMod !== 4096) d = d * stabMod / 4096
  d = Math.floor(pokeRound(d) * typeEff)
  if (burn) d = Math.floor(d / 2)
  return pokeRound(Math.max(1, d * finalMod / 4096))
}

// ---------------------------------------------------------------------------------------------------------------
// Modifier lists. `c` is a normalised description of one hit:
//   move   { slug, type, physical }           physical = the move's CATEGORY (Psyshock is special, Body Press physical)
//   a / d  { ability, item, species, types, status, hpFrac, canEvolve }   attacker / defender (kebab-case slugs)
//   f      { weather, terrain, gravity, doubles }
//   aSide / dSide   field flags for each side
//   typeEff, crit, ate (Normalize / -ate boost applies), power (the move's effective base power, before modifiers)
// ---------------------------------------------------------------------------------------------------------------
const isName = (species, ...names) => names.some(n => species === n || String(species || '').startsWith(n + '-'))
const sunny = (w) => w === 'sun' || w === 'harsh-sunshine'
const rainy = (w) => w === 'rain' || w === 'heavy-rain'
const hasStatus = (s) => !!s && s !== 'none'

export function isGroundedMon(types, ability, item, gravity) {
  return !!gravity || item === 'iron-ball' || !((types || []).includes('flying') || ability === 'levitate' || ability === 'eelevate' || item === 'air-balloon')
}

const TYPE_BOOST_ITEM = {
  charcoal: 'fire', 'mystic-water': 'water', magnet: 'electric', 'miracle-seed': 'grass', 'never-melt-ice': 'ice', 'black-belt': 'fighting',
  'poison-barb': 'poison', 'soft-sand': 'ground', 'sharp-beak': 'flying', 'twisted-spoon': 'psychic', 'silver-powder': 'bug', 'hard-stone': 'rock',
  'spell-tag': 'ghost', 'dragon-fang': 'dragon', 'black-glasses': 'dark', 'metal-coat': 'steel', 'silk-scarf': 'normal', 'pink-bow': 'normal', 'polkadot-bow': 'normal', 'pixie-plate': 'fairy',
  'flame-plate': 'fire', 'splash-plate': 'water', 'zap-plate': 'electric', 'meadow-plate': 'grass', 'icicle-plate': 'ice', 'fist-plate': 'fighting',
  'toxic-plate': 'poison', 'earth-plate': 'ground', 'sky-plate': 'flying', 'mind-plate': 'psychic', 'insect-plate': 'bug', 'stone-plate': 'rock',
  'spooky-plate': 'ghost', 'draco-plate': 'dragon', 'dread-plate': 'dark', 'iron-plate': 'steel', 'sea-incense': 'water', 'wave-incense': 'water',
  'odd-incense': 'psychic', 'rock-incense': 'rock', 'rose-incense': 'grass', 'fairy-feather': 'fairy'
}
export const TYPE_BOOST_ITEM_TYPES = TYPE_BOOST_ITEM

function boostedByItemType(a, type) {
  const item = a.item
  if (!item) return false
  if (TYPE_BOOST_ITEM[item] === type) return true
  if (item === 'adamant-orb' && isName(a.species, 'dialga') && (type === 'steel' || type === 'dragon')) return true
  if (item === 'adamant-crystal' && a.species === 'dialga-origin' && (type === 'steel' || type === 'dragon')) return true
  if (item === 'lustrous-orb' && isName(a.species, 'palkia') && (type === 'water' || type === 'dragon')) return true
  if (item === 'lustrous-globe' && a.species === 'palkia-origin' && (type === 'water' || type === 'dragon')) return true
  if ((item === 'griseous-orb' || item === 'griseous-core') && isName(a.species, 'giratina') && (type === 'ghost' || type === 'dragon')) return true
  if (item === 'soul-dew' && isName(a.species, 'latios', 'latias') && (type === 'psychic' || type === 'dragon')) return true
  return false
}

export function basePowerMods(c) {
  const { move, a, d, f, aSide } = c
  const fl = moveFlags(move.slug)
  const m = []
  const attackerGrounded = isGroundedMon(a.types, a.ability, a.item, f.gravity)
  const defenderGrounded = isGroundedMon(d.types, d.ability, d.item, f.gravity)
  if (c.knockOffBoost) m.push(6144)
  else if (move.slug === 'misty-explosion' && attackerGrounded && f.terrain === 'misty') m.push(6144)
  else if (move.slug === 'grav-apple' && f.gravity) m.push(6144)
  else if (move.slug === 'expanding-force' && attackerGrounded && f.terrain === 'psychic') m.push(6144)
  else if ((move.slug === 'solar-beam' || move.slug === 'solar-blade') && (rainy(f.weather) || f.weather === 'sand' || f.weather === 'snow')) m.push(2048)
  else if ((move.slug === 'collision-course' || move.slug === 'electro-drift') && c.typeEff >= 2) m.push(5461)

  if (aSide.helpingHand) m.push(6144)
  if (attackerGrounded && ((f.terrain === 'electric' && move.type === 'electric') || (f.terrain === 'grassy' && move.type === 'grass') || (f.terrain === 'psychic' && move.type === 'psychic'))) m.push(activeGeneration() > 7 ? 5325 : 6144) // terrain: x1.3 from Gen 8, x1.5 in Gen 7
  if (defenderGrounded && ((f.terrain === 'misty' && move.type === 'dragon') || (f.terrain === 'grassy' && (move.slug === 'bulldoze' || move.slug === 'earthquake')))) m.push(2048)

  const ab = a.ability
  if ((ab === 'technician' && c.power <= 60) || (ab === 'flare-boost' && a.status === 'burn' && !move.physical)
    || (ab === 'toxic-boost' && (a.status === 'poison' || a.status === 'toxic') && move.physical) || (ab === 'mega-launcher' && fl.pulse)
    || (ab === 'strong-jaw' && fl.bite) || (ab === 'steely-spirit' && move.type === 'steel') || (ab === 'sharpness' && fl.slicing)) m.push(6144)
  if (aSide.charge && move.type === 'electric') m.push(8192)

  const aura = move.type === 'fairy' ? 'fairy-aura' : move.type === 'dark' ? 'dark-aura' : null
  if (aura && (a.ability === aura || d.ability === aura)) {
    m.push((a.ability === 'aura-break' || d.ability === 'aura-break') ? 3072 : 5448)
  }
  if ((ab === 'sheer-force' && fl.secondary) || (ab === 'sand-force' && f.weather === 'sand' && (move.type === 'rock' || move.type === 'ground' || move.type === 'steel'))
    || (ab === 'tough-claws' && c.contact) || (ab === 'punk-rock' && fl.sound) || (ab === 'analytic' && c.analyticActive)) m.push(5325)
  if (d.ability === 'heatproof' && move.type === 'fire' && activeGeneration() <= 8) m.push(2048) // Gen 8 and earlier: halves base power
  if (aSide.battery && !move.physical) m.push(5325)
  if (aSide.powerSpot) m.push(5325)
  if (ab === 'rivalry' && a.gender !== 'N' && d.gender !== 'N') m.push(a.gender === d.gender ? 5120 : 3072)
  if (c.ate) m.push(activeGeneration() === 6 ? 5325 : 4915) // -ate abilities: x1.3 in Gen 6, x1.2 from Gen 7
  if ((ab === 'reckless' && fl.recoil) || (ab === 'iron-fist' && fl.punch)) m.push(4915)
  if (d.ability === 'dry-skin' && move.type === 'fire') m.push(5120)

  if (a.item === `${move.type}-gem` && move.slug !== 'struggle') m.push(activeGeneration() >= 6 ? 5325 : 6144) // gems: x1.5 in Gen 5, x1.3 after
  else if (move.slug !== 'struggle' && boostedByItemType(a, move.type)) m.push(4915)
  else if ((a.item === 'muscle-band' && move.physical) || (a.item === 'wise-glasses' && !move.physical)) m.push(4505)
  else if (a.item === 'punching-glove' && fl.punch) m.push(4506)
  return m
}

// Hustle is applied to the raw attack BEFORE the chain (physical only).
// Is the Pokémon at or below `frac` of its max HP? Uses the exact HP numbers when they are known (a.hpExact = { cur, max }), else the percentage.
const hpAtMost = (mon, frac) => (mon.hpExact ? mon.hpExact.cur <= mon.hpExact.max * frac : mon.hpFrac <= frac)

export function attackMods(c) {
  const { move, a, d, f, aSide } = c
  const m = []
  const ab = a.ability
  const pinch = hpAtMost(a, 1 / 3)
  if (ab === 'defeatist' && hpAtMost(a, 1 / 2)) m.push(2048)
  else if (ab === 'solar-power' && sunny(f.weather) && !move.physical) m.push(6144)
  else if (ab === 'gorilla-tactics' && move.physical) m.push(6144)
  else if ((ab === 'guts' && hasStatus(a.status) && move.physical)
    || (pinch && ((ab === 'overgrow' && move.type === 'grass') || (ab === 'blaze' && move.type === 'fire') || (ab === 'torrent' && move.type === 'water') || (ab === 'swarm' && move.type === 'bug')))) m.push(6144)
  else if ((ab === 'steelworker' && move.type === 'steel') || (ab === "dragons-maw" && move.type === 'dragon') || (ab === 'rocky-payload' && move.type === 'rock')
    || (ab === 'fire-mane' && move.type === 'fire')) m.push(6144)
  else if (ab === 'transistor' && move.type === 'electric') m.push(activeGeneration() >= 9 ? 5325 : 6144) // x1.3 in Gen 9, x1.5 before
  else if ((ab === 'water-bubble' && move.type === 'water') || ((ab === 'huge-power' || ab === 'pure-power') && move.physical)) m.push(8192)

  if (aSide.flowerGift && sunny(f.weather) && move.physical) m.push(6144)
  if (aSide.steelySpirit && move.type === 'steel') m.push(6144)

  const da = d.ability
  if ((da === 'thick-fat' && (move.type === 'fire' || move.type === 'ice')) || (da === 'water-bubble' && move.type === 'fire')
    || (da === 'purifying-salt' && move.type === 'ghost') || (da === 'heatproof' && move.type === 'fire' && activeGeneration() >= 9)) m.push(2048) // Gen 9: halves the attack stat
  if ((da === 'tablets-of-ruin' && ab !== 'tablets-of-ruin' && move.physical) || (da === 'vessel-of-ruin' && ab !== 'vessel-of-ruin' && !move.physical)) m.push(3072)
  if ((ab === 'hadron-engine' && !move.physical && f.terrain === 'electric') || (ab === 'orichalcum-pulse' && move.physical && sunny(f.weather))) m.push(5461)

  const sp = a.species
  if ((a.item === 'thick-club' && isName(sp, 'cubone', 'marowak') && move.physical) || (a.item === 'deep-sea-tooth' && sp === 'clamperl' && !move.physical)
    || (a.item === 'light-ball' && String(sp).includes('pikachu'))) m.push(8192)
  else if ((a.item === 'choice-band' && move.physical) || (a.item === 'choice-specs' && !move.physical)) m.push(6144)
  return m
}

export function defenseMods(c, hitsPhysical) {
  const { a, d, f, dSide } = c
  const m = []
  const dab = d.ability
  if (dab === 'marvel-scale' && hasStatus(d.status) && hitsPhysical) m.push(6144)
  else if (isName(d.species, 'cherrim') && dab === 'flower-gift' && sunny(f.weather) && !hitsPhysical) m.push(6144)
  else if (dSide.flowerGift && sunny(f.weather) && !hitsPhysical) m.push(6144)
  else if (dab === 'grass-pelt' && f.terrain === 'grassy' && hitsPhysical) m.push(6144)
  else if (dab === 'fur-coat' && hitsPhysical) m.push(8192)

  if ((a.ability === 'sword-of-ruin' && dab !== 'sword-of-ruin' && hitsPhysical) || (a.ability === 'beads-of-ruin' && dab !== 'beads-of-ruin' && !hitsPhysical)) m.push(3072)
  if ((d.item === 'eviolite' && d.canEvolve !== false) || (!hitsPhysical && d.item === 'assault-vest')) m.push(6144)
  else if ((d.item === 'metal-powder' && d.species === 'ditto' && hitsPhysical) || (d.item === 'deep-sea-scale' && d.species === 'clamperl' && !hitsPhysical)) m.push(8192)
  return m
}

// Sandstorm raises a Rock type's Sp. Def and Snow an Ice type's Defense by 1.5 BEFORE the chain.
export function weatherDefenseBoost(weather, types, hitsPhysical) {
  return (weather === 'sand' && (types || []).includes('rock') && !hitsPhysical) || (weather === 'snow' && snowBoostsIce() && (types || []).includes('ice') && hitsPhysical)
}

// Final-damage chain for the hit. firstHit = it is the first hit of the sequence (Multiscale, resist berries).
export function finalMods(c, firstHit) {
  const { move, a, d, f, aSide, dSide } = c
  const fl = moveFlags(move.slug)
  const m = []
  const screen = f.doubles ? (activeGeneration() >= 6 ? 2732 : 2703) : 2048
  const crit = c.crit
  const breaksScreens = move.slug === 'brick-break' || move.slug === 'psychic-fangs' || move.slug === 'raging-bull' || a.ability === 'infiltrator'
  if (!breaksScreens) {
    if (dSide.reflect && move.physical && !crit && !dSide.auroraVeil) m.push(screen)
    else if (dSide.lightScreen && !move.physical && !crit && !dSide.auroraVeil) m.push(screen)
    if (dSide.auroraVeil && !crit) m.push(screen)
  }

  if (a.ability === 'neuroforce' && c.typeEff > 1) m.push(5120)
  else if (a.ability === 'sniper' && crit) m.push(6144)
  else if (a.ability === 'tinted-lens' && c.typeEff < 1) m.push(8192)

  if (firstHit && (d.ability === 'multiscale' || d.ability === 'shadow-shield') && d.fullHp && !c.pbChild) m.push(2048)
  if ((d.ability === 'fluffy' || d.ability === 'aura-guard') && c.contact && a.ability !== 'long-reach') m.push(2048)
  else if ((d.ability === 'punk-rock' && fl.sound) || (d.ability === 'ice-scales' && !move.physical)) m.push(2048)
  if ((d.ability === 'solid-rock' || d.ability === 'filter' || d.ability === 'prism-armor') && c.typeEff > 1) m.push(3072)
  if (dSide.friendGuard) m.push(3072)
  if (d.ability === 'fluffy' && move.type === 'fire') m.push(8192)

  if (a.item === 'expert-belt' && c.typeEff > 1) m.push(4915)
  else if (a.item === 'life-orb') m.push(5324)

  if (firstHit && c.berry && !['unnerve', 'as-one-glastrier', 'as-one-spectrier'].includes(a.ability)) m.push(d.ability === 'ripen' ? 1024 : 2048)
  return m
}

// Can this move do ANYTHING to the defender? (type immunity, immunity abilities, Air Balloon, Psychic Terrain vs priority,
// Harsh Sunshine / Heavy Rain vs Water / Fire). `c.typeEff` is the plain type effectiveness, `c.f.gravity` etc. as above.
export function isImmune(c) {
  const { move, a, d, f } = c
  const fl = moveFlags(move.slug)
  if (c.typeEff === 0) return true
  if ((f.weather === 'harsh-sunshine' && move.type === 'water') || (f.weather === 'heavy-rain' && move.type === 'fire')) return true
  const da = d.ability
  const groundImmune = move.type === 'ground' && !f.gravity && move.slug !== 'thousand-arrows'
  if ((da === 'wonder-guard' && c.typeEff <= 1) || (move.type === 'grass' && da === 'sap-sipper') || (move.type === 'fire' && (da === 'flash-fire' || da === 'well-baked-body'))
    || (move.type === 'water' && (da === 'dry-skin' || (da === 'storm-drain' && activeGeneration() >= 5) || da === 'water-absorb'))
    || (move.type === 'electric' && ((da === 'lightning-rod' && activeGeneration() >= 5) || da === 'motor-drive' || da === 'volt-absorb')) // Lightning Rod / Storm Drain only redirect before Gen 5
    || (groundImmune && d.item !== 'iron-ball' && (da === 'levitate' || da === 'eelevate'))
    || (fl.bullet && da === 'bulletproof') || (fl.sound && move.slug !== 'clangorous-soul' && da === 'soundproof')
    || (fl.priority && (da === 'queenly-majesty' || da === 'dazzling' || da === 'armor-tail'))
    || (move.type === 'ground' && da === 'earth-eater') || (fl.wind && da === 'wind-rider')) return true
  if (groundImmune && d.item === 'air-balloon') return true
  if (fl.priority && f.terrain === 'psychic' && isGroundedMon(d.types, d.ability, d.item, f.gravity)) return true
  return false
}


// ---- Stat boosts that happen by themselves when the situation is set up (the reference calc applies them automatically) ----
// Terrain seeds (+1 Def / Sp. Def in the matching terrain, Contrary reverses it, and the seed is used up), Embody Aspect (Ogerpon masks: +1 to a
// stat) and Wind Rider with Tailwind (+1 Attack). Returns the stage change for each side and whether a side's item was used up.
// Intimidate, Intrepid Sword and Dauntless Shield are NOT here: they only apply "when the ability has just activated", which this app leaves to the
// stat stages you enter yourself.
export function entryStageDeltas({ a, d, f, aSide, dSide, moveName }) {
  const out = { a: {}, d: {}, aItemUsed: false, dItemUsed: false }
  const bump = (who, key, n) => { out[who][key] = (out[who][key] ?? 0) + n }
  // Meteor Beam / Electro Shot: the charge turn raises Sp. Atk first (Simple doubles it, Contrary reverses it).
  if (moveName === 'meteor-beam' || moveName === 'electro-shot') bump('a', 'special-attack', a.ability === 'simple' ? 2 : a.ability === 'contrary' ? -1 : 1)
  for (const [who, mon, side] of [['a', a, aSide], ['d', d, dSide]]) {
    const item = mon.item
    if (item && f.terrain && f.terrain !== 'none' && /-seed$/.test(item)) {
      const seedTerrain = item.replace(/-seed$/, '')
      if (seedTerrain === f.terrain) {
        const key = (seedTerrain === 'grassy' || seedTerrain === 'electric') ? 'defense' : 'special-defense'
        bump(who, key, mon.ability === 'contrary' ? -1 : 1)
        out[`${who}ItemUsed`] = true
      }
    }
    if (mon.ability === 'embody-aspect-cornerstone') bump(who, 'defense', 1)
    if (mon.ability === 'embody-aspect-hearthflame') bump(who, 'attack', 1)
    if (mon.ability === 'embody-aspect-wellspring') bump(who, 'special-defense', 1)
    if (mon.ability === 'wind-rider' && side?.tailwind) bump(who, 'attack', 1)
    if (activeGeneration() === 8) { // Gen 8: these two raise the stat on switch-in without needing to be toggled on
      if (mon.ability === 'intrepid-sword') bump(who, 'attack', 1)
      if (mon.ability === 'dauntless-shield') bump(who, 'defense', 1)
    }
  }
  return out
}


// ---- Exact final Speed (stages, weather / terrain / item / status modifiers, paralysis), as the reference calc computes it. ----
const POWER_ITEMS_2048 = ['macho-brace', 'power-anklet', 'power-band', 'power-belt', 'power-bracer', 'power-lens', 'power-weight', 'iron-ball']
export function finalSpeed(raw, stage, { ability = '', item = '', weather = 'none', terrain = 'none', tailwind = false, status = 'none', species = '' } = {}) {
  let speed = stageStat(raw, stage)
  const mods = []
  if (tailwind) mods.push(8192)
  const sun = weather === 'sun' || weather === 'harsh-sunshine', rain = weather === 'rain' || weather === 'heavy-rain'
  if ((ability === 'chlorophyll' && sun) || (ability === 'sand-rush' && weather === 'sand') || (ability === 'swift-swim' && rain)
    || (ability === 'slush-rush' && weather === 'snow') || (ability === 'surge-surfer' && terrain === 'electric')) mods.push(8192)
  else if (ability === 'quick-feet' && hasStatus(status)) mods.push(6144)
  if (item === 'choice-scarf') mods.push(6144)
  else if (POWER_ITEMS_2048.includes(item)) mods.push(2048)
  else if (item === 'quick-powder' && species === 'ditto') mods.push(8192)
  speed = pokeRound(speed * chainMods(mods, 410, 131172) / 4096)
  if (hasStatus(status) && status === 'paralysis' && ability !== 'quick-feet') speed = Math.floor(speed * (activeGeneration() >= 7 ? 50 : 25) / 100) // paralysis: x0.5 from Gen 7, x0.25 before
  return Math.max(0, Math.min(activeGeneration() <= 2 ? 999 : 10000, speed))
}

// ---- Effects that depend on the FINAL stats of both Pokémon (known once a spread exists) ----
//   Download (+1 Attack or Sp. Atk, whichever the target's lower defense calls for), Analytic (x1.3 when the user moves last or the target is switching out),
//   and the moves whose power depends on who is faster: Gyro Ball, Electro Ball, Payback, Bolt Beak, Fishious Rend.
// `fin` = { aSpeed, dSpeed, dDef, dSpd } (dDef / dSpd = the defender's Defense / Sp. Def after stages, in the reference's order), or null while the
// optimizer is still choosing (then: when the attacker is the opponent assume the worst case, when it is you assume no help).
export function speedDependent({ moveName, basePower, abilityA, offStat, opponentAttacks, wonderRoom, switchingOut = false }, fin) {
  const out = { downloadKey: null, analyticActive: false, power: null }
  if (!fin) {
    if (abilityA === 'download' && opponentAttacks) out.downloadKey = offStat
    if (abilityA === 'analytic') out.analyticActive = !!opponentAttacks || switchingOut
    return out
  }
  const { aSpeed, dSpeed } = fin
  const first = aSpeed > dSpeed
  if (abilityA === 'download') {
    let def = fin.dDef, spd = fin.dSpd
    if (wonderRoom) [def, spd] = [spd, def]
    out.downloadKey = spd <= def ? 'special-attack' : 'attack'
  }
  if (abilityA === 'analytic') out.analyticActive = !first || switchingOut
  if (moveName === 'payback') out.power = basePower * (first ? 1 : 2)
  else if (moveName === 'bolt-beak' || moveName === 'fishious-rend') out.power = basePower * (first ? 2 : 1)
  else if (moveName === 'electro-ball') {
    const r = Math.floor(aSpeed / dSpeed)
    out.power = dSpeed === 0 ? 40 : r >= 4 ? 150 : r >= 3 ? 120 : r >= 2 ? 80 : r >= 1 ? 60 : 40
  } else if (moveName === 'gyro-ball') out.power = aSpeed === 0 ? 1 : Math.min(150, Math.floor(25 * dSpeed / aSpeed) + (activeGeneration() >= 5 ? 1 : 0)) // the +1 came with Gen 5
  // HP-scaled power from the real HP numbers (the calc uses integer maths, not a rounded percentage).
  const { aHp, dHp } = fin
  if ((moveName === 'flail' || moveName === 'reversal') && aHp) {
    if (activeGeneration() === 4) { // Gen 4 scales HP to 64
      const p4 = Math.floor(64 * aHp.cur / aHp.max)
      out.power = p4 <= 1 ? 200 : p4 <= 5 ? 150 : p4 <= 12 ? 100 : p4 <= 21 ? 80 : p4 <= 42 ? 40 : 20
    } else {
      const px = Math.floor(48 * aHp.cur / aHp.max)
      out.power = px <= 1 ? 200 : px <= 4 ? 150 : px <= 9 ? 100 : px <= 16 ? 80 : px <= 32 ? 40 : 20
    }
  }
  if ((moveName === 'eruption' || moveName === 'water-spout' || moveName === 'dragon-energy') && aHp) out.power = Math.max(1, Math.floor(150 * aHp.cur / aHp.max))
  if (moveName === 'brine' && dHp) out.power = (basePower ?? 65) * (dHp.cur <= dHp.max / 2 ? 2 : 1) // doubles at or below half HP (real HP numbers)
  if ((moveName === 'crush-grip' || moveName === 'wring-out') && dHp && activeGeneration() <= 4) out.power = Math.floor(dHp.cur * 120 / dHp.max) + 1
  else if ((moveName === 'crush-grip' || moveName === 'wring-out' || moveName === 'hard-press') && dHp) {
    const k = moveName === 'hard-press' ? 100 : 120
    const q = 100 * Math.floor(dHp.cur * 4096 / dHp.max)
    out.power = Math.floor(Math.floor((k * q + 2047) / 4096) / 100) || 1
  }
  return out
}
