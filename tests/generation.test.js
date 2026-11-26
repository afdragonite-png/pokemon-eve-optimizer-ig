import { describe, it, expect, afterEach } from 'vitest'
import { setGeneration, activeGeneration, moveForGeneration, pokemonForGeneration } from '../src/lib/generation.js'
import { staticTypeMultiplier } from '../src/lib/typeChart.js'
import { loadPokemon, getMove, getItemList, getTypeMultiplier, configurePokeApi } from '../src/lib/pokeapi.js'

afterEach(async () => { await setGeneration(9) })

describe('generation data layer', () => {
  it('Gen 8 uses its own move data (Draco Meteor 130, Sucker Punch 70)', async () => {
    await setGeneration(8)
    expect(activeGeneration()).toBe(8)
    expect((await getMove('draco-meteor')).power).toBe(130)
    expect((await getMove('sucker-punch')).power).toBe(70)
    expect(await getMove('tera-blast')).toBeNull() // does not exist in Gen 8
  })
  it('Gen 9 is untouched: moves come from PokeAPI, the chart is the Gen 9 one', async () => {
    await setGeneration(8)
    await setGeneration(9)
    expect(moveForGeneration('draco-meteor', { name: 'x' })).toEqual({ name: 'x' })
    expect(staticTypeMultiplier('dragon', ['fairy'])).toBe(0)
  })
  it('loads species for a generation without the network; later-generation species are not found', async () => {
    configurePokeApi({ fetchImpl: async () => { throw new TypeError('offline') }, retries: 0 })
    await setGeneration(8)
    const r = await loadPokemon('garchomp')
    expect(r.status).toBe('ok')
    expect(r.data.stats.map(s => s.base_stat)).toEqual([108, 130, 95, 80, 85, 102])
    expect(r.data.types.map(t => t.type.name)).toEqual(['dragon', 'ground'])
    expect((await loadPokemon('sprigatito')).status).toBe('notfound')
    const items = await getItemList()
    expect(items.some(i => i.name === 'choice-band')).toBe(true)
    expect(items.some(i => i.name === 'booster-energy')).toBe(false)
    expect(await getTypeMultiplier('fire', ['steel'])).toBe(2)
    configurePokeApi({ fetchImpl: null, retries: 2 })
  })
  it('pokemonForGeneration is null for unknown species', async () => {
    await setGeneration(8)
    expect(pokemonForGeneration('notamon')).toBeNull()
  })
})

describe('generation rules', () => {
  it('differ where the games differ (crit multiplier, Parental Bond, paralysis, terrain, Hail)', async () => {
    const { adjustBaseDamage } = await import('../src/lib/dmgMods.js')
    const { statusParalysisSpeedMultiplier } = await import('../src/lib/pokemonMath.js')
    await setGeneration(5)
    expect(adjustBaseDamage(100, { crit: true })).toBe(200) // x2 crits in Gen 5
    expect(statusParalysisSpeedMultiplier('paralysis', '')).toBe(0.25)
    await setGeneration(6)
    expect(adjustBaseDamage(100, { crit: true })).toBe(150)
    expect(adjustBaseDamage(100, { pbChild: true })).toBe(50) // 50% second hit in Gen 6
    await setGeneration(7)
    expect(adjustBaseDamage(100, { pbChild: true })).toBe(25)
    expect(statusParalysisSpeedMultiplier('paralysis', '')).toBe(0.5)
    await setGeneration(9)
    expect(adjustBaseDamage(100, { crit: true })).toBe(150)
  })
  it('older Pokémon lists exclude later species and moves', async () => {
    await setGeneration(5)
    expect((await getMove('moonblast'))).toBeNull() // Gen 6 move
    expect((await getMove('earthquake')).power).toBe(100)
    await setGeneration(6)
    expect((await getMove('moonblast')).power).toBe(95)
    expect((await getMove('draco-meteor')).power).toBe(130)
  })
})

describe('Gens 3 and 4 (older damage code)', () => {
  it('Gen 3 has no physical / special split: the category follows the type', async () => {
    await setGeneration(3)
    expect((await getMove('shadow-ball')).damage_class.name).toBe('physical') // Ghost was physical
    expect((await getMove('bite')).damage_class.name).toBe('special') // Bite was Dark-typed, and Dark was special
    expect((await getMove('thunderbolt')).damage_class.name).toBe('special')
    expect((await getMove('earthquake')).damage_class.name).toBe('physical')
  })
  it('Gen 4 splits by move, Future Sight is typeless, and rolls floor step by step', async () => {
    await setGeneration(4)
    expect((await getMove('shadow-ball')).damage_class.name).toBe('special')
    expect((await getMove('future-sight')).type.name).toBe('???')
    const { legacyRolls } = await import('../src/lib/legacyDamage.js')
    // L50, 100 BP, 100 atk vs 100 def, STAB, 2x then 0.5x on the other type.
    const legacy = { gen: 4, physical: true, burn: false, screen: null, weather: null, spread: false, crit: false, sniper: false, stab: 1.5, t1: 2, t2: 0.5 }
    const rolls = legacyRolls({ level: 50, attackStat: 100, legacy }, { power: 100 }, 100, true)
    // 4400 / 100 = 44, +2 = 46; roll 100% = 46; STAB 69; x2 = 138; x0.5 = 69
    expect(rolls[15]).toBe(69)
  })
})

describe('Gens 1 and 2 (DVs, stat experience, byte-scaled damage)', () => {
  it('stats use DVs and stat exp, the HP DV comes from the other DVs, Special is shared', async () => {
    await setGeneration(2)
    const { calculateStat, ivFor, evFor, rollCount } = await import('../src/lib/pokemonMath.js')
    // Base 100, DV 15, 252 stat exp ("63"), level 100: floor(((100+15)*2 + 63) * 100/100) + 5
    expect(calculateStat('attack', 100, 31, 252, 100, 'Adamant')).toBe(298) // natures do nothing before Gen 3
    expect(calculateStat('hp', 100, 31, 252, 100, 'Hardy')).toBe(403)
    expect(ivFor('hp', { attack: 31, defense: 31, speed: 31, 'special-attack': 31 })).toBe(30) // all odd DVs -> HP DV 15
    expect(ivFor('hp', { attack: 0, defense: 31, speed: 31, 'special-attack': 31 })).toBe(14)
    expect(ivFor('special-defense', { 'special-attack': 20, 'special-defense': 3 })).toBe(20)
    expect(evFor('special-defense', { 'special-attack': 100, 'special-defense': 0 })).toBe(100)
    expect(rollCount()).toBe(39)
    await setGeneration(9)
    expect(rollCount()).toBe(16)
  })
  it('Gen 1 / 2 damage: 39 rolls, stats above 255 are scaled, Gen 1 crits double the level', async () => {
    await setGeneration(2)
    const { legacyRolls } = await import('../src/lib/legacyDamage.js')
    const L = { gen: 2, crit: false, weather: null, itemBoost: false, pursuit: false, stab: false, metalPowder: false, t1: 1, t2: 1 }
    const r = legacyRolls({ level: 100, attackStat: 400, legacy: L }, { power: 80 }, 300, true)
    expect(r).toHaveLength(39)
    // at 400 -> 100, df 300 -> 75: floor(floor(42*100*80/75)/50) = floor(4480/50) = 89, +2 = 91; top roll 255/255
    expect(r.at(-1)).toBe(91)
    await setGeneration(1)
    const crit = legacyRolls({ level: 50, attackStat: 100, legacy: { ...L, gen: 1, crit: true } }, { power: 50 }, 100, true)
    expect(crit.at(-1)).toBe(Math.floor(Math.floor(Math.floor(2 * 100 / 5 + 2) * 100 * 50 / 100) / 50) + 2)
  })
})
