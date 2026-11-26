// One place for every PokeAPI request: in-memory cache, in-flight de-duplication, optional localStorage persistence
// for the big stable lists, timeouts + retries, and typed errors the UI can show.
import { staticTypeMultiplier } from './typeChart.js'
import { generationData, moveForGeneration, pokemonForGeneration, pokemonListForGeneration, itemListForGeneration } from './generation.js'

const BASE = 'https://pokeapi.co/api/v2'
const STORAGE_PREFIX = 'pokeapi:v1:'
const STORAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000

// kind: 'notfound' (404 - normal while typing), 'network' (offline / timeout / DNS), 'http' (5xx, 429, ...), 'parse'.
export class ApiError extends Error {
  constructor(kind, message, { status = null, path = '' } = {}) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
    this.path = path
  }
}

const config = { retries: 2, retryDelayMs: 400, timeoutMs: 15000, fetchImpl: null }
// Tests (and unusual hosts) can override fetch / delays.
export function configurePokeApi(patch) { Object.assign(config, patch) }

const mem = new Map()       // path -> parsed JSON
const inflight = new Map()  // path -> Promise (shared by concurrent callers)

export function clearPokeApiCache({ persistent = true } = {}) {
  mem.clear()
  inflight.clear()
  if (persistent) {
    try {
      const keys = []
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(STORAGE_PREFIX)) keys.push(k) }
      keys.forEach(k => localStorage.removeItem(k))
    } catch { /* storage unavailable */ }
  }
}

function readStored(path) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + path)
    if (!raw) return null
    const { t, d } = JSON.parse(raw)
    if (Date.now() - t > STORAGE_TTL_MS) return null
    return d
  } catch { return null }
}
function writeStored(path, data) {
  try { localStorage.setItem(STORAGE_PREFIX + path, JSON.stringify({ t: Date.now(), d: data })) } catch { /* quota / unavailable */ }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function fetchOnce(path) {
  const f = config.fetchImpl ?? globalThis.fetch
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = ctrl ? setTimeout(() => ctrl.abort(), config.timeoutMs) : null
  let res
  try {
    res = await f(`${BASE}${path}`, ctrl ? { signal: ctrl.signal } : undefined)
  } catch (err) {
    throw new ApiError('network', err?.name === 'AbortError' ? 'The request timed out.' : 'Could not reach PokeAPI (offline?).', { path })
  } finally { if (timer) clearTimeout(timer) }
  if (res.status === 404) throw new ApiError('notfound', 'Not found.', { status: 404, path })
  if (!res.ok) throw new ApiError('http', `PokeAPI returned ${res.status}.`, { status: res.status, path })
  try { return await res.json() } catch { throw new ApiError('parse', 'PokeAPI sent a response that could not be read.', { path }) }
}

async function fetchWithRetry(path, retries = config.retries) {
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await fetchOnce(path) } catch (err) {
      lastErr = err
      const retryable = err instanceof ApiError && (err.kind === 'network' || (err.kind === 'http' && (err.status >= 500 || err.status === 429)))
      if (!retryable || attempt === retries) break
      await sleep(config.retryDelayMs * 2 ** attempt)
    }
  }
  throw lastErr
}

// GET `path` (e.g. '/pokemon/garchomp'). Successful responses are cached for the session; failures never are.
// persist: also keep it in localStorage for a week (use for big, stable lists only).
export function fetchJson(path, { persist = false, retries } = {}) {
  if (mem.has(path)) return Promise.resolve(mem.get(path))
  if (persist) {
    const stored = readStored(path)
    if (stored) { mem.set(path, stored); return Promise.resolve(stored) }
  }
  if (inflight.has(path)) return inflight.get(path)
  const p = fetchWithRetry(path, retries).then(data => {
    mem.set(path, data)
    if (persist) writeStored(path, data)
    return data
  }).finally(() => inflight.delete(path))
  inflight.set(path, p)
  return p
}

// Human-readable text for an error thrown by this module (anything else gets a generic line).
export function describeError(err, what = 'data') {
  if (err instanceof ApiError) {
    if (err.kind === 'notfound') return `No ${what} with that name.`
    if (err.kind === 'network') return `Couldn't load ${what}: ${err.message}`
    return `Couldn't load ${what}: ${err.message}`
  }
  return `Couldn't load ${what}: ${err?.message ?? 'unknown error'}`
}

// ---- Lists ----
export async function getPokemonList() {
  const gl = pokemonListForGeneration()
  if (gl) return gl // an older generation: the bundled list
  const head = await fetchJson('/pokemon?limit=1', { persist: true })
  const all = await fetchJson(`/pokemon?limit=${head.count}`, { persist: true })
  return all.results
}
export async function getItemList() {
  const gl = itemListForGeneration()
  if (gl) return gl
  const d = await fetchJson('/item?limit=2000', { persist: true })
  return d.results
}

// ---- Pokémon / moves ----
export async function getMove(name) {
  if (generationData()) return moveForGeneration(name) // an older generation: type / power / category as they were then
  try { return await fetchJson(`/move/${name}`) } catch (err) {
    if (err instanceof ApiError && err.kind === 'notfound') return null
    throw err
  }
}

// PokeAPI wants a form name ("landorus-incarnate"); players type the species ("landorus"). If the direct lookup
// 404s, fall back to the species' default form. Returns { slug } or null when neither exists. Network errors throw.
export async function resolveDefaultForm(slug) {
  try {
    const sp = await fetchJson(`/pokemon-species/${slug}`)
    return sp.varieties?.find(v => v.is_default)?.pokemon?.name ?? null
  } catch (err) {
    if (err instanceof ApiError && err.kind === 'notfound') return null
    throw err
  }
}

// Load a Pokémon by whatever the user typed.
//   { status: 'ok', data, resolvedFrom }   resolvedFrom is the typed name when the species fallback was used
//   { status: 'notfound' }                 nothing by that name (normal while typing)
// Throws ApiError for network / server problems so the caller can show an error with a retry button.
export async function loadPokemon(name) {
  if (generationData()) return loadPokemonForGeneration(name)
  return loadPokemonLive(name)
}

// Older generation: stats, types, abilities and the move pool come from the bundled data; PokeAPI only adds sprites (and the
// learnset when it answers), so a failed request never blocks the calculator.
async function loadPokemonLive(name, { retries } = {}) {
  const slug = String(name ?? '').trim().toLowerCase().replace(/\s+/g, '-')
  if (!slug) return { status: 'notfound' }
  try {
    const data = await fetchJson(`/pokemon/${slug}`, { retries })
    if (data && Array.isArray(data.stats)) return { status: 'ok', data, resolvedFrom: null }
    return { status: 'notfound' }
  } catch (err) {
    if (!(err instanceof ApiError) || err.kind !== 'notfound') throw err
  }
  const dflt = await resolveDefaultForm(slug)
  if (!dflt) return { status: 'notfound' }
  try {
    const data = await fetchJson(`/pokemon/${dflt}`)
    if (data && Array.isArray(data.stats)) return { status: 'ok', data, resolvedFrom: slug }
  } catch (err) {
    if (!(err instanceof ApiError) || err.kind !== 'notfound') throw err
  }
  return { status: 'notfound' }
}

async function loadPokemonForGeneration(name) {
  const slug = String(name ?? '').trim().toLowerCase().replace(/\s+/g, '-')
  if (!slug) return { status: 'notfound' }
  let resolvedFrom = null, key = slug
  if (!pokemonForGeneration(slug)) {
    // "landorus" -> first bundled form whose name starts with it
    const alt = Object.keys(generationData().species).find(k => k.startsWith(slug + '-'))
    if (!alt) return { status: 'notfound' }
    key = alt; resolvedFrom = slug
  }
  let live = null
  try { const r = await loadPokemonLive(key, { retries: 0 }); if (r.status === 'ok') live = r.data } catch { /* offline: sprites/learnset are optional */ }
  return { status: 'ok', data: pokemonForGeneration(key, live), resolvedFrom }
}

// Used by the Showdown importers: slug in, { ok, slug } out (never throws).
export async function resolvePokemonSlug(slug) {
  if (!slug) return { ok: false, slug }
  try {
    const r = await loadPokemon(slug)
    if (r.status === 'ok') return { ok: true, slug: r.data.name }
  } catch { /* network error: fall through */ }
  return { ok: false, slug }
}

// ---- Types ----
export async function getTypeData(typeName) {
  return fetchJson(`/type/${typeName}`, { persist: true })
}

// Effectiveness of a move type against a defender's types. Type data is cached per type (one request each, ever),
// and if PokeAPI can't be reached the built-in Gen 9 chart answers instead, so Optimize never fails on this.
export async function getTypeMultiplier(moveTypeName, defenderTypeNames = []) {
  if (!moveTypeName) return 1
  if (generationData()) return staticTypeMultiplier(moveTypeName, defenderTypeNames) // older generation: its own chart
  let rel
  try { rel = (await getTypeData(moveTypeName)).damage_relations } catch { return staticTypeMultiplier(moveTypeName, defenderTypeNames) }
  let m = 1
  for (const t of defenderTypeNames) {
    if (rel.double_damage_to.some(x => x.name === t)) m *= 2
    if (rel.half_damage_to.some(x => x.name === t)) m *= 0.5
    if (rel.no_damage_to.some(x => x.name === t)) m *= 0
  }
  return m
}
