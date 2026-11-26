// Generation 3 and 4 damage, the way @smogon/calc (mechanics/gen3.js, gen4.js) does it. Before Gen 5 there is no 4096ths
// chain: every modifier is a plain multiplication that is floored on its own, so the ORDER of the steps matters.
//   Gen 4: base = floor(floor(floor(2L/5+2) x power x atk / 50) / def); burn; screens, spread, weather, +2, crit, Life Orb;
//          then per roll: STAB, type 1, type 2, Filter, Expert Belt, Tinted Lens, resist berry (each floored).
//   Gen 3: base = floor(floor(floor(2L/5+2) x atk x power / def) / 50); burn, screens, spread, weather, +2, crit, Pursuit,
//          Weather Ball, Charge, Helping Hand, STAB; type 1, type 2; then per roll.
// Item and ability effects on the stats and the base power are listed in attackFn / defenseFn / powerFn (the calc's
// calculateAttackDPP / DefenseDPP / BPModsDPP and the ADV versions).
import { stageStat, TYPE_BOOST_ITEM_TYPES } from './dmgMods.js'
import { activeGeneration } from './generation.js'
import { staticTypeMultiplier } from './typeChart.js'
import { moveFlags } from './moveFlags.js'

const isName = (species, ...names) => names.some(n => species === n || String(species || '').startsWith(n + '-'))
const sunny = (w) => w === 'sun' || w === 'harsh-sunshine'
const hasStatus = (s) => !!s && s !== 'none'
const fl = Math.floor

// Simple (Gen 4): stat stages count double.
function simpleStat(stat, mod) {
  const m = Math.min(6, Math.max(-6, mod * 2))
  return m > 0 ? fl(stat * (2 + m) / 2) : m < 0 ? fl(stat * 2 / (2 - m)) : stat
}

function itemBoostType(a) {
  const item = a.item
  if (!item) return null
  return TYPE_BOOST_ITEM_TYPES[item] ?? null
}
function orbBoosts(a, type) {
  const item = a.item
  return (item === 'adamant-orb' && isName(a.species, 'dialga') && (type === 'steel' || type === 'dragon'))
    || (item === 'lustrous-orb' && isName(a.species, 'palkia') && (type === 'water' || type === 'dragon'))
    || (item === 'griseous-orb' && a.species === 'giratina-origin' && (type === 'ghost' || type === 'dragon'))
}

// ---- base power ----
export function powerFn(gen, c) {
  const { move, a, d, aSide } = c
  const ab = a.ability
  const pinchOk = (a.hpExact ? a.hpExact.cur <= a.hpExact.max / 3 : a.hpFrac <= 1 / 3)
  return (bp0) => {
    let bp = bp0
    if (gen <= 2) return bp // Gens 1 and 2 have no base-power modifiers (the Gen 2 type-item boost works on the damage, see legacyRolls)
    if (gen === 3) {
      if (pinchOk && ((ab === 'overgrow' && move.type === 'grass') || (ab === 'blaze' && move.type === 'fire')
        || (ab === 'torrent' && move.type === 'water') || (ab === 'swarm' && move.type === 'bug'))) bp = fl(bp * 1.5)
      return bp
    }
    if (aSide.helpingHand) bp = fl(bp * 1.5)
    if (aSide.charge && move.type === 'electric') bp = fl(bp * 2)
    if (ab === 'technician' && bp <= 60) bp = fl(bp * 1.5)
    const phys = move.physical
    if ((a.item === 'muscle-band' && phys) || (a.item === 'wise-glasses' && !phys)) bp = fl(bp * 1.1)
    else if (itemBoostType(a) === move.type || orbBoosts(a, move.type)) bp = fl(bp * 1.2)
    const fm = moveFlags(move.slug)
    if ((ab === 'reckless' && fm.recoil) || (ab === 'iron-fist' && fm.punch)) bp = fl(bp * 1.2)
    else if (pinchOk && ((ab === 'overgrow' && move.type === 'grass') || (ab === 'blaze' && move.type === 'fire')
      || (ab === 'torrent' && move.type === 'water') || (ab === 'swarm' && move.type === 'bug'))) bp = fl(bp * 1.5)
    if ((d.ability === 'heatproof' && move.type === 'fire') || (d.ability === 'thick-fat' && (move.type === 'fire' || move.type === 'ice'))) bp = fl(bp * 0.5)
    else if (d.ability === 'dry-skin' && move.type === 'fire') bp = fl(bp * 1.25)
    if (ab === 'rivalry' && a.gender !== 'N' && d.gender !== 'N') bp = fl(bp * (a.gender === d.gender ? 1.25 : 0.75))
    return bp
  }
}

// ---- attack stat: (raw, stage) -> final ----
// Gens 1 and 2: a critical hit ignores stat stages, burn and screens. In Gen 1 always; in Gen 2 only when the attacker's boost is not above the target's.
const ignoresMods12 = (gen, c) => !!c.crit && (gen === 1 || (gen === 2 && (c.stageA ?? 0) <= (c.stageD ?? 0)))
export function attackFn(gen, c) {
  const { move, a, d, f, aSide } = c
  const phys = move.physical, ab = a.ability, sp = a.species
  if (gen <= 2) {
    const ignore = ignoresMods12(gen, c)
    return (raw, stage) => {
      let at = ignore ? raw : stageStat(raw, stage)
      if (!ignore && phys && a.status === 'burn') at = fl(at / 2)
      if ((sp === 'pikachu' && a.item === 'light-ball' && !phys) || (isName(sp, 'cubone', 'marowak') && a.item === 'thick-club' && phys)) at *= 2
      return at
    }
  }
  if (gen === 3) {
    return (raw, stage) => {
      let at = raw
      if (phys && (ab === 'huge-power' || ab === 'pure-power')) at *= 2
      const t = itemBoostType(a)
      if (a.item !== 'sea-incense' && t === move.type) at = fl(at * 1.1)
      else if (a.item === 'sea-incense' && move.type === 'water') at = fl(at * 1.05)
      else if ((phys && a.item === 'choice-band') || (!phys && a.item === 'soul-dew' && isName(sp, 'latios', 'latias'))) at = fl(at * 1.5)
      else if ((!phys && a.item === 'deep-sea-tooth' && sp === 'clamperl') || (!phys && a.item === 'light-ball' && isName(sp, 'pikachu'))
        || (phys && a.item === 'thick-club' && isName(sp, 'cubone', 'marowak'))) at *= 2
      if (d.ability === 'thick-fat' && (move.type === 'fire' || move.type === 'ice')) at = fl(at / 2)
      if ((phys && (ab === 'hustle' || (ab === 'guts' && hasStatus(a.status))))) at = fl(at * 1.5)
      if (stage !== 0) at = stageStat(at, stage)
      return at
    }
  }
  return (raw, stage) => {
    let at = raw
    if (ab === 'simple') at = simpleStat(at, stage)
    else if (stage !== 0) at = stageStat(at, stage)
    if (phys && (ab === 'pure-power' || ab === 'huge-power')) at *= 2
    else if (sunny(f.weather) && ab === (phys ? 'flower-gift' : 'solar-power')) at = fl(at * 1.5)
    else if (phys && (ab === 'hustle' || (ab === 'guts' && hasStatus(a.status)))) at = fl(at * 1.5)
    if (aSide.flowerGift && ab !== 'flower-gift' && sunny(f.weather) && phys) at = fl(at * 1.5)
    if ((phys ? a.item === 'choice-band' : a.item === 'choice-specs') || (!phys && a.item === 'soul-dew' && isName(sp, 'latios', 'latias'))) at = fl(at * 1.5)
    else if ((a.item === 'light-ball' && sp === 'pikachu') || (a.item === 'thick-club' && isName(sp, 'cubone', 'marowak') && phys)
      || (a.item === 'deep-sea-tooth' && sp === 'clamperl' && !phys)) at *= 2
    return at
  }
}

// ---- defense stat: (raw, stage) -> final ----
export function defenseFn(gen, c) {
  const { move, a, d, f, dSide } = c
  const phys = move.physical, dab = d.ability
  if (gen <= 2) {
    const ignore = ignoresMods12(gen, c)
    return (raw, stage) => {
      let df = ignore ? raw : stageStat(raw, stage)
      if (move.slug === 'explosion' || move.slug === 'self-destruct') df = fl(df / 2)
      if (!ignore) { if (phys && dSide.reflect) df *= 2; else if (!phys && dSide.lightScreen) df *= 2 }
      return df
    }
  }
  if (gen === 3) {
    return (raw, stage) => {
      let df = raw
      if (!phys && d.item === 'soul-dew' && isName(d.species, 'latios', 'latias')) df = fl(df * 1.5)
      else if ((!phys && d.item === 'deep-sea-scale' && d.species === 'clamperl') || (phys && d.item === 'metal-powder' && d.species === 'ditto')) df *= 2
      if (phys && dab === 'marvel-scale' && hasStatus(d.status)) df = fl(df * 1.5)
      if (move.slug === 'explosion' || move.slug === 'self-destruct') df = fl(df / 2)
      if (stage !== 0) df = stageStat(df, stage)
      return df
    }
  }
  return (raw, stage) => {
    let df = raw
    if (dab === 'simple') df = simpleStat(df, stage)
    else if (stage !== 0) df = stageStat(df, stage)
    if (dab === 'marvel-scale' && hasStatus(d.status) && phys) df = fl(df * 1.5)
    else if (dab === 'flower-gift' && sunny(f.weather) && !phys) df = fl(df * 1.5)
    else if (dSide.flowerGift && sunny(f.weather) && !phys) df = fl(df * 1.5)
    if (d.item === 'soul-dew' && isName(d.species, 'latios', 'latias') && !phys) df = fl(df * 1.5)
    else if ((d.item === 'deep-sea-scale' && d.species === 'clamperl' && !phys) || (d.item === 'metal-powder' && d.species === 'ditto' && phys)) df *= 2
    if (f.weather === 'sand' && (d.types || []).includes('rock') && !phys) df = fl(df * 1.5)
    if (move.slug === 'explosion' || move.slug === 'self-destruct') df = fl(df * 0.5)
    return Math.max(1, df)
  }
}

// ---- type effectiveness, one defender type at a time, in the calc's fixed order ----
const ORDER = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel']
function perTypeEff(c) {
  const { move, d, f, a } = c
  let [t1, t2] = d.types || []
  if (t2 && t1 !== t2 && ORDER.indexOf(t1) > ORDER.indexOf(t2)) [t1, t2] = [t2, t1]
  const one = (t) => {
    if (!t) return 1
    if (t === 'ghost' && (move.type === 'normal' || move.type === 'fighting') && (a.ability === 'scrappy' || c.foresight)) return 1
    if (t === 'flying' && move.type === 'ground' && f.gravity) return 1
    return staticTypeMultiplier(move.type, [t])
  }
  let e1 = one(t1), e2 = one(t2)
  if (e1 * e2 === 0 && move.type === 'ground' && d.item === 'iron-ball' && a.ability !== 'klutz') { if (e1 === 0) e1 = 1; else if (e2 === 0) e2 = 1 }
  // Anything the chart does not explain (Strong Winds, Tera Shell ...): keep the engine's combined number.
  if (e1 * e2 !== c.typeEff) return [c.typeEff, 1]
  return [e1, e2]
}

// ---- everything the roll step needs besides power / attack / defense ----
export function legacyKernel(gen, c, { spreadKind = '' } = {}) {
  const { move, a, d, f, dSide, aSide } = c
  const phys = move.physical
  if (gen <= 2) {
    const t = (d.types || [])
    const [e1, e2] = gen === 1 ? [staticTypeMultiplier(move.type, t.slice(0, 1)), t[1] ? staticTypeMultiplier(move.type, [t[1]]) : 1] : [c.typeEff, 1]
    const w = f.weather
    let weather = null
    if ((w === 'sun' && move.type === 'fire') || (w === 'rain' && move.type === 'water')) weather = 1.5
    else if ((w === 'sun' && move.type === 'water') || (w === 'rain' && (move.type === 'fire' || move.slug === 'solar-beam'))) weather = 0.5
    let itemType = null
    if (gen === 2 && a.item && a.item !== 'dragon-fang') itemType = a.item === 'dragon-scale' ? 'dragon' : (TYPE_BOOST_ITEM_TYPES[a.item] ?? null)
    return { gen, ignore: ignoresMods12(gen, c), crit: !!c.crit, weather, itemBoost: itemType === move.type,
      pursuit: move.slug === 'pursuit' && !!c.switchingOut, stab: (a.types || []).includes(move.type) && !(move.slug === 'struggle' && gen >= 2), // Struggle is Normal-typed in Gen 1
      metalPowder: gen === 2 && d.species === 'ditto' && d.item === 'metal-powder', t1: e1, t2: e2 }
  }
  const [t1, t2] = perTypeEff(c)
  const eff = t1 * t2
  const doubles = !!f.doubles
  let screen = null
  if (!c.crit) {
    const mult = doubles ? 2 / 3 : 1 / 2
    const breaks = move.slug === 'brick-break'
    if (!breaks) { if (phys && dSide.reflect) screen = mult; else if (!phys && dSide.lightScreen) screen = mult }
  }
  let weather = null
  const w = f.weather
  if ((sunny(w) && move.type === 'fire') || (w === 'rain' && move.type === 'water')) weather = gen === 4 ? 1.5 : 1.5
  else if ((sunny(w) && move.type === 'water') || (w === 'rain' && move.type === 'fire') || (move.slug === 'solar-beam' && (w === 'rain' || w === 'sand' || w === 'snow'))) weather = 0.5
  let stab = 1
  if ((a.types || []).includes(move.type) && move.slug !== 'struggle') stab = (gen === 4 && a.ability === 'adaptability') ? 2 : 1.5
  const out = { gen, physical: phys, burn: a.status === 'burn' && phys && a.ability !== 'guts', screen, weather,
    spread: doubles && (gen === 4 ? (spreadKind === 'a' || spreadKind === 'f') : spreadKind === 'f'),
    crit: !!c.crit, sniper: gen === 4 && a.ability === 'sniper', stab, t1, t2 }
  if (gen === 4) {
    out.lifeOrb = a.item === 'life-orb'
    out.filter = (d.ability === 'filter' || d.ability === 'solid-rock') && eff > 1
    out.ebelt = a.item === 'expert-belt' && eff > 1
    out.tinted = a.ability === 'tinted-lens' && eff < 1
    out.berry = !!c.berry
  } else {
    out.pursuit = move.slug === 'pursuit' && !!c.switchingOut
    out.weatherBall = move.slug === 'weather-ball' && !!w && w !== 'none'
    out.charge = !!aSide.charge && move.type === 'electric'
    out.helpingHand = !!aSide.helpingHand
  }
  return out
}

// ---- the 16 rolls of one hit ----
export function legacyRolls(p, spec, defStat, first) {
  const L = p.legacy
  if (L.gen <= 2) return rolls12(p, L, spec, defStat)
  const lv2 = fl(2 * p.level / 5 + 2)
  const atk = p.attackStat, bp = spec.power
  let b
  if (L.gen === 4) b = fl(fl(lv2 * bp * atk / 50) / defStat)
  else b = fl(fl(lv2 * atk * bp / defStat) / 50)
  if (L.gen === 4) {
    if (L.burn) b = fl(b * 0.5)
    if (L.screen != null) b = fl(b * L.screen)
    if (L.spread) b = fl(b * 3 / 4)
    if (L.weather != null) b = fl(b * L.weather)
    b += 2
    if (L.crit) b *= L.sniper ? 3 : 2
    if (L.lifeOrb) b = fl(b * 1.3)
    const out = []
    for (let i = 0; i < 16; i++) {
      let d = fl(b * (85 + i) / 100)
      d = fl(d * L.stab)
      d = fl(d * L.t1)
      d = fl(d * L.t2)
      if (L.filter) d = fl(d * 0.75)
      if (L.ebelt) d = fl(d * 1.2)
      if (L.tinted) d = fl(d * 2)
      if (L.berry && first) d = fl(d * 0.5)
      out.push(Math.max(1, d))
    }
    return out
  }
  if (L.burn) b = fl(b / 2)
  if (L.screen != null) b = fl(b * L.screen)
  if (L.spread) b = fl(b / 2)
  if (L.weather != null) b = fl(b * L.weather)
  b = (L.physical ? Math.max(1, b) : b) + 2
  if (L.crit) b *= 2
  if (L.pursuit) b = fl(b * 2)
  if (L.weatherBall) b *= 2
  if (L.charge) b *= 2
  if (L.helpingHand) b = fl(b * 1.5)
  if (L.stab !== 1) b = fl(b * L.stab)
  b = fl(b * L.t1)
  b = fl(b * L.t2)
  const out = []
  for (let i = 85; i <= 100; i++) out.push(Math.max(1, fl(b * i / 100)))
  return out
}

// Gens 1 and 2: 217..255 out of 255 (39 rolls), attack / defense scaled to a byte when either is above 255, damage capped at 997.
function rolls12(p, L, spec, defStat) {
  let at = p.attackStat, df = defStat
  const lv = L.gen === 1 && L.crit ? p.level * 2 : p.level // a Gen 1 critical hit doubles the level
  if (at > 255 || df > 255) { at = fl(at / 4) % 256; df = fl(df / 4) % 256 }
  if (L.metalPowder) df = fl(df * 1.5)
  let b = fl(fl(fl(2 * lv / 5 + 2) * Math.max(1, at) * spec.power / Math.max(1, df)) / 50)
  if (L.gen === 2 && L.crit) b *= 2
  if (L.pursuit) b = fl(b * 2)
  if (L.itemBoost) b = fl(b * 1.1)
  b = Math.min(997, b) + 2
  if (L.weather != null) b = fl(b * L.weather)
  if (L.stab) b = fl(b * 1.5)
  if (L.gen === 1) { b = fl(b * L.t1); b = fl(b * L.t2) } else b = fl(b * L.t1 * L.t2)
  const out = []
  for (let i = 217; i <= 255; i++) out.push(L.gen === 2 ? Math.max(1, fl(b * i / 255)) : (b === 1 ? 1 : fl(b * i / 255)))
  return out
}
