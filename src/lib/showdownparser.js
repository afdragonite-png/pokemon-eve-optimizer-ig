// Parses Pokémon Showdown set text and maps its names onto PokeAPI slugs.
//
//   Garchomp @ Rocky Helmet
//   Ability: Rough Skin
//   Level: 50
//   EVs: 252 HP / 4 Def / 252 Spe
//   Jolly Nature
//   IVs: 0 Atk
//   - Earthquake
//   - Dragon Claw

import { resolvePokemonSlug } from './pokeapi.js'

const STAT_ALIASES = {
  hp: 'hp', atk: 'attack', def: 'defense', spa: 'special-attack', spd: 'special-defense', spe: 'speed',
  attack: 'attack', defense: 'defense', 'sp. atk': 'special-attack', 'sp. def': 'special-defense', speed: 'speed',
  spatk: 'special-attack', spdef: 'special-defense'
}
const STAT_KEYS = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed']
const NATURE_NAMES = ['Hardy', 'Lonely', 'Brave', 'Adamant', 'Naughty', 'Bold', 'Docile', 'Relaxed', 'Impish', 'Lax', 'Timid', 'Hasty',
  'Serious', 'Jolly', 'Naive', 'Modest', 'Mild', 'Quiet', 'Bashful', 'Rash', 'Calm', 'Gentle', 'Sassy', 'Careful', 'Quirky']

// "King's Rock" -> "kings-rock", "Mr. Mime" -> "mr-mime", "As One (Glastrier)" -> "as-one-glastrier".
export function slugify(name) {
  return String(name ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/♀/g, '-f').replace(/♂/g, '-m')
    .replace(/[’'.:,]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function parseStatLine(rest) {
  const out = {}
  for (const part of rest.split('/')) {
    const m = /(\d+)\s*([A-Za-z.\s]+)/.exec(part.trim())
    if (!m) continue
    const key = STAT_ALIASES[m[2].trim().toLowerCase()]
    if (key) out[key] = Number(m[1])
  }
  return out
}

function parseBlock(block) {
  const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
  if (!lines.length) return null
  const header = lines[0]
  if (/^(ability|level|evs|ivs|tera type|shiny|happiness|-|–)/i.test(header)) return null

  const [namePart, ...itemParts] = header.split(' @ ')
  const item = itemParts.join(' @ ').trim()
  const noGender = namePart.replace(/\s*\((M|F)\)\s*$/i, '').trim()
  const nick = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(noGender)
  const species = (nick ? nick[2] : noGender).trim()
  if (!species) return null

  const set = {
    species, item: slugify(item), ability: '', level: null, nature: null, tera: null,
    evs: Object.fromEntries(STAT_KEYS.map(k => [k, 0])),
    ivs: Object.fromEntries(STAT_KEYS.map(k => [k, 31])),
    moves: []
  }
  for (const line of lines.slice(1)) {
    let m
    if ((m = /^ability:\s*(.+)$/i.exec(line))) set.ability = slugify(m[1])
    else if ((m = /^level:\s*(\d+)/i.exec(line))) set.level = Math.max(1, Math.min(100, Number(m[1])))
    else if ((m = /^tera type:\s*(.+)$/i.exec(line))) set.tera = slugify(m[1])
    else if ((m = /^evs:\s*(.+)$/i.exec(line))) Object.assign(set.evs, parseStatLine(m[1]))
    else if ((m = /^ivs:\s*(.+)$/i.exec(line))) Object.assign(set.ivs, parseStatLine(m[1]))
    else if ((m = /^(\w+)\s+nature$/i.exec(line))) {
      const n = NATURE_NAMES.find(x => x.toLowerCase() === m[1].toLowerCase())
      if (n) set.nature = n
    }
    else if (/^[-–]\s*/.test(line)) {
      // "- Thunder Punch / Ice Punch" style alternates: keep the first.
      const mv = line.replace(/^[-–]\s*/, '').split('/')[0].trim()
      if (mv && set.moves.length < 4) set.moves.push(slugify(mv))
    }
  }
  return set
}

// Returns every set found in the text (blank-line separated), in order.
export function parseShowdown(text) {
  return String(text ?? '').replace(/\r/g, '').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean)
    .map(parseBlock).filter(Boolean)
}

// Showdown writes base forms as just the species ("Landorus", "Giratina"); PokeAPI wants a form name
// ("landorus-incarnate"). pokeapi.js tries the name directly, then falls back to the species' default form.
export async function resolveSpeciesSlug(speciesName) {
  return resolvePokemonSlug(slugify(speciesName))
}

// Champions SP are roughly EVs / 8 (252 EVs -> 32 SP), capped at 32 per stat.
export function evsToSp(evs) {
  return Object.fromEntries(STAT_KEYS.map(k => [k, Math.min(32, Math.round((evs?.[k] ?? 0) / 8))]))
}