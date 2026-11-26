import { describe, it, expect, beforeEach, vi } from 'vitest'
import { configurePokeApi, clearPokeApiCache, fetchJson, loadPokemon, getMove, getTypeMultiplier, resolvePokemonSlug, ApiError, describeError } from '../src/lib/pokeapi.js'

const pokemon = (name) => ({ name, stats: [{ stat: { name: 'speed' }, base_stat: 91 }], moves: [], types: [] })
const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

// A fake PokeAPI: path -> response (object = 200 JSON, number = status code, function = custom).
function fakeApi(routes) {
  const calls = []
  const impl = vi.fn(async (url) => {
    const path = url.replace('https://pokeapi.co/api/v2', '')
    calls.push(path)
    const r = routes[path]
    if (r === undefined) return json({}, 404)
    if (typeof r === 'function') return r()
    if (typeof r === 'number') return json({}, r)
    return json(r)
  })
  configurePokeApi({ fetchImpl: impl, retries: 2, retryDelayMs: 1, timeoutMs: 1000 })
  return { calls, impl }
}

// Minimal in-memory localStorage.
function installStorage() {
  const m = new Map()
  globalThis.localStorage = {
    get length() { return m.size }, key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k)
  }
  return m
}

beforeEach(() => { delete globalThis.localStorage; clearPokeApiCache({ persistent: false }) })

describe('pokeapi cache', () => {
  it('serves repeat requests from memory', async () => {
    const api = fakeApi({ '/pokemon/garchomp': pokemon('garchomp') })
    await fetchJson('/pokemon/garchomp'); await fetchJson('/pokemon/garchomp')
    expect(api.calls).toEqual(['/pokemon/garchomp'])
  })
  it('shares one request between concurrent callers', async () => {
    const api = fakeApi({ '/pokemon/garchomp': pokemon('garchomp') })
    await Promise.all([fetchJson('/pokemon/garchomp'), fetchJson('/pokemon/garchomp'), loadPokemon('garchomp')])
    expect(api.calls).toEqual(['/pokemon/garchomp'])
  })
  it('never caches failures', async () => {
    let n = 0
    const api = fakeApi({ '/move/tackle': () => (++n === 1 ? json({}, 404) : json({ name: 'tackle', type: {}, damage_class: {} })) })
    expect(await getMove('tackle')).toBeNull()
    expect((await getMove('tackle')).name).toBe('tackle')
    expect(api.calls.length).toBe(2)
  })
  it('persists big lists to localStorage and reuses them after the memory cache is gone', async () => {
    installStorage()
    const api = fakeApi({ '/type/fire': { damage_relations: { double_damage_to: [{ name: 'grass' }], half_damage_to: [], no_damage_to: [] } } })
    await getTypeMultiplier('fire', ['grass'])
    clearPokeApiCache({ persistent: false })
    expect(await getTypeMultiplier('fire', ['grass'])).toBe(2)
    expect(api.calls).toEqual(['/type/fire'])
  })
  it('ignores stored data older than the TTL', async () => {
    const store = installStorage()
    store.set('pokeapi:v1:/type/fire', JSON.stringify({ t: Date.now() - 8 * 24 * 3600 * 1000, d: { damage_relations: { double_damage_to: [], half_damage_to: [], no_damage_to: [] } } }))
    const api = fakeApi({ '/type/fire': { damage_relations: { double_damage_to: [{ name: 'grass' }], half_damage_to: [], no_damage_to: [] } } })
    expect(await getTypeMultiplier('fire', ['grass'])).toBe(2)
    expect(api.calls).toEqual(['/type/fire'])
  })
})

describe('pokeapi errors and retries', () => {
  it('retries network failures and then succeeds', async () => {
    let n = 0
    const api = fakeApi({ '/pokemon/ditto': () => { if (++n < 3) throw new TypeError('offline'); return json(pokemon('ditto')) } })
    expect((await loadPokemon('ditto')).status).toBe('ok')
    expect(api.calls.length).toBe(3)
  })
  it('retries 5xx / 429 but not 404', async () => {
    const api = fakeApi({ '/pokemon/a': 503, '/pokemon/b': 429 })
    await expect(loadPokemon('a')).rejects.toMatchObject({ kind: 'http', status: 503 })
    expect(api.calls.filter(c => c === '/pokemon/a').length).toBe(3)
    await expect(loadPokemon('b')).rejects.toMatchObject({ kind: 'http', status: 429 })
    const before = api.calls.length
    expect((await loadPokemon('nope')).status).toBe('notfound') // 404 on the pokemon AND the species lookup, one try each
    expect(api.calls.length - before).toBe(2)
  })
  it('reports a persistent network failure as a typed error, with readable text', async () => {
    fakeApi({ '/pokemon/ditto': () => { throw new TypeError('offline') } })
    const err = await loadPokemon('ditto').catch(e => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.kind).toBe('network')
    expect(describeError(err, 'this Pokémon')).toMatch(/Couldn't load this Pokémon/)
  })
  it('falls back to the built-in type chart when type data cannot be loaded', async () => {
    fakeApi({ '/type/water': 500 })
    expect(await getTypeMultiplier('water', ['fire'])).toBe(2)
    expect(await getTypeMultiplier('water', ['grass', 'dragon'])).toBe(0.25)
    expect(await getTypeMultiplier('electric', ['ground'])).toBe(0)
  })
})

describe('species -> form fallback', () => {
  const routes = {
    '/pokemon/landorus-incarnate': pokemon('landorus-incarnate'),
    '/pokemon-species/landorus': { varieties: [{ is_default: true, pokemon: { name: 'landorus-incarnate' } }, { is_default: false, pokemon: { name: 'landorus-therian' } }] }
  }
  it('resolves "landorus" to its default form and says where it came from', async () => {
    fakeApi(routes)
    const r = await loadPokemon('Landorus')
    expect(r.status).toBe('ok'); expect(r.data.name).toBe('landorus-incarnate'); expect(r.resolvedFrom).toBe('landorus')
  })
  it('does not use the fallback when the exact form exists', async () => {
    const api = fakeApi(routes)
    const r = await loadPokemon('landorus-incarnate')
    expect(r.resolvedFrom).toBeNull(); expect(api.calls).toEqual(['/pokemon/landorus-incarnate'])
  })
  it('turns spaces into hyphens', async () => {
    fakeApi({ '/pokemon/iron-valiant': pokemon('iron-valiant') })
    expect((await loadPokemon('Iron Valiant')).data.name).toBe('iron-valiant')
  })
  it('says notfound for nonsense and for empty input, and resolvePokemonSlug never throws', async () => {
    fakeApi({})
    expect((await loadPokemon('zzzz')).status).toBe('notfound')
    expect((await loadPokemon('  ')).status).toBe('notfound')
    expect(await resolvePokemonSlug('zzzz')).toEqual({ ok: false, slug: 'zzzz' })
    fakeApi({ '/pokemon/ditto': () => { throw new TypeError('offline') } })
    expect(await resolvePokemonSlug('ditto')).toEqual({ ok: false, slug: 'ditto' })
  })
  it('resolvePokemonSlug returns the form PokeAPI accepts', async () => {
    fakeApi(routes)
    expect(await resolvePokemonSlug('landorus')).toEqual({ ok: true, slug: 'landorus-incarnate' })
  })
})
