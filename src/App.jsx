import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import './styles/App.css'
import OpponentEditor from './components/OpponentEditor'
import HpBar from './components/HpBar'
import { calculateStat, calculateStatChampions, ivFor, clampStage, itemSpriteUrl, evaluateAllGoals, evaluateAllGoalsChampions, MEGA_STONES, resolveEffectiveMove, specialDamageKind, fetchCanEvolve, fetchGenderRate } from './lib/pokemonMath'
import GenerationSelect, { CHAMPIONS } from './components/GenerationSelect'
import ShowdownImport from './components/ShowdownImport'
import ApiStatus from './components/ApiStatus'
import OptimizerOptions from './components/OptimizerOptions'
import ResultsView from './components/ResultsView'
// The file on disk is lib/showdownparser.js (all lowercase); the import must match it exactly or the build breaks on
// case-sensitive systems (Linux, Vercel, CI).
import { parseShowdown, resolveSpeciesSlug } from './lib/showdownparser'
import { getPokemonList, getItemList, getMove, loadPokemon, describeError } from './lib/pokeapi'
import { resolveGoals, mergeDerived, goalsForOptimizer } from './lib/goalResolver'
import { createOptimizerClient, CancelledError } from './lib/optimizerClient'
import { setGeneration as activateGeneration } from './lib/generation'
import FieldPanel, { FIELD_MIN_GEN } from './components/FieldPanel'

const TERRAIN_ABILITIES = { 'grassy-surge': 'grassy', 'electric-surge': 'electric', 'psychic-surge': 'psychic', 'misty-surge': 'misty' }
const WEATHER_ABILITIES = { 'drizzle': 'rain', 'drought': 'sun', 'sand-stream': 'sand', 'snow-warning': 'snow' }

function App() {
  const [investInOffense, setInvestInOffense] = useState(true)
  const [investInSpeed, setInvestInSpeed] = useState(true)
  const [pokemonList, setPokemonList] = useState([])
  const [selectedName, setSelectedName] = useState('')
  const [pokemonData, setPokemonData] = useState(null)
  const [itemList, setItemList] = useState([])
  const [ivs, setIvs] = useState({ hp: 31, attack: 31, defense: 31, 'special-attack': 31, 'special-defense': 31, speed: 31 })
  const [userAbility, setUserAbility] = useState('')
  const [userItem, setUserItem] = useState('')
  const [userItemSprite, setUserItemSprite] = useState(null)
  const [userMoves, setUserMoves] = useState(['', '', '', ''])
  const [userMoveInfo, setUserMoveInfo] = useState([null, null, null, null])
  const [userStatStages, setUserStatStages] = useState({ attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0 })
  const [goals, setGoals] = useState([])
  const [activeGoalId, setActiveGoalId] = useState(null)
  const [result, setResult] = useState(null)
  const [optimizing, setOptimizing] = useState(false)
  const [optimizeError, setOptimizeError] = useState(null)
  const [lockedNature, setLockedNature] = useState('')
  const [pinned, setPinned] = useState({})
  const [listStatus, setListStatus] = useState({ pokemon: { loading: true, error: null }, items: { loading: true, error: null } })
  const [listsReload, setListsReload] = useState(0)
  const [pokemonStatus, setPokemonStatus] = useState({ loading: false, error: null, notFound: false, resolvedFrom: null })
  const [pokemonReload, setPokemonReload] = useState(0)
  const [moveInfoError, setMoveInfoError] = useState(null)
  const optimizerClient = useRef(null)
  const runCounter = useRef(0)
  const [lastHpPoints, setLastHpPoints] = useState(0)
  const [gameFormat, setGameFormat] = useState('singles')
  // Only Gen 9 rules exist so far; the picker is in place for the other generations.
  const [generation, setGeneration] = useState(9)
  // Pokémon Champions (SP system, Level 50) is its own entry in the generation picker.
  const championsMode = generation === CHAMPIONS
  // Champions uses the Gen 9 data; Gens 1-8 use their own bundled data (moves, species, type chart, items, abilities).
  const dataGeneration = championsMode ? 9 : generation
  const [rawLevel, setRawLevel] = useState(100)
  const [battleConditions, setBattleConditions] = useState({
    weather: 'none', terrain: 'none', trickRoom: false, fieldLevel: 100,
    yourSpikes: 0, oppSpikes: 0, yourStealthRock: false, oppStealthRock: false,
    yourReflect: false, yourLightScreen: false, yourAuroraVeil: false, yourTailwind: false,
    oppReflect: false, oppLightScreen: false, oppAuroraVeil: false, oppTailwind: false,
    yourFriendGuard: false, yourBattery: false, yourPowerSpot: false, yourSteelySpirit: false,
    oppFriendGuard: false, oppBattery: false, oppPowerSpot: false, oppSteelySpirit: false,
    magicRoom: false, wonderRoom: false, gravity: false,
    yourProtect: false, yourLeechSeed: false, yourSaltCure: false, yourForesight: false,
    yourHelpingHand: false, yourFlowerGift: false, yourPowerTrick: false, yourSwitchingOut: false,
    yourCharge: false, yourNightmare: false, yourStatus: 'none', yourHpPercent: 100, yourCrit: false,
    oppProtect: false, oppLeechSeed: false, oppSaltCure: false, oppForesight: false,
    oppHelpingHand: false, oppFlowerGift: false, oppPowerTrick: false, oppSwitchingOut: false,
    oppCharge: false, oppNightmare: false, oppStatus: 'none', oppCrit: false
  })

  const level = championsMode ? 50 : rawLevel

  // Switching generation swaps the data behind every lookup, so what was picked under the old one is cleared (species stay if
  // they exist there). `generationReady` holds the UI back until the new data is loaded.
  const [generationReady, setGenerationReady] = useState(true)
  const firstGeneration = useRef(true)
  useEffect(() => {
    if (firstGeneration.current) { firstGeneration.current = false; return }
    let cancelled = false
    setGenerationReady(false)
    activateGeneration(dataGeneration).then(() => {
      if (cancelled) return
      optimizerClient.current?.cancel()
      setResult(null); setOptimizeError(null)
      setGoals([]); setActiveGoalId(null)
      setUserMoves(['', '', '', '']); setUserItem(''); setUserAbility('')
      setUserStatStages({ attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0 })
      setUserMoveInfo([null, null, null, null])
      // Field options that do not exist in this generation are switched off.
      setBattleConditions(prev => {
        const next = { ...prev }
        const g = dataGeneration
        if (g < 6) next.terrain = 'none'
        if (g < 7 && next.terrain === 'psychic') next.terrain = 'none'
        if (g < 6 && ['harsh-sunshine', 'heavy-rain', 'strong-winds'].includes(next.weather)) next.weather = 'none'
        for (const side of ['your', 'opp']) {
          if (g < 7) { next[`${side}AuroraVeil`] = false; next[`${side}Battery`] = false }
          if (g < 8) { next[`${side}PowerSpot`] = false; next[`${side}SteelySpirit`] = false }
        }
        if (g < 2 || (g === 2 && next.weather !== 'sun' && next.weather !== 'rain')) next.weather = 'none' // Gen 2 only has Sun and Rain; Gen 1 has no weather
        // Anything that only exists in a later generation is switched off.
        for (const [key, min] of Object.entries(FIELD_MIN_GEN)) {
          if (g >= min) continue
          if (key === 'trickRoom' || key === 'gravity' || key === 'magicRoom' || key === 'wonderRoom') next[key] = false
          else for (const side of ['your', 'opp']) next[`${side}${key}`] = key === 'Spikes' ? 0 : false
        }
        if (g === 2) for (const side of ['your', 'opp']) next[`${side}Spikes`] = Math.min(1, next[`${side}Spikes`] ?? 0)
        return next
      })
      if (dataGeneration < 3) setGameFormat('singles') // no Double Battles before Gen 3
      setListsReload(n => n + 1); setPokemonReload(n => n + 1)
      setGenerationReady(true)
    })
    return () => { cancelled = true }
  }, [dataGeneration])

  useEffect(() => { if (!championsMode) setRawLevel(battleConditions.fieldLevel) }, [battleConditions.fieldLevel])
  // The Pokémon and item lists are big and rarely change: cached (memory + localStorage), with a Retry on failure.
  useEffect(() => {
    let cancelled = false
    setListStatus({ pokemon: { loading: true, error: null }, items: { loading: true, error: null } })
    getItemList()
      .then(list => { if (!cancelled) { setItemList(list); setListStatus(s => ({ ...s, items: { loading: false, error: null } })) } })
      .catch(err => { if (!cancelled) setListStatus(s => ({ ...s, items: { loading: false, error: describeError(err, 'the item list') } })) })
    getPokemonList()
      .then(list => { if (!cancelled) { setPokemonList(list); setListStatus(s => ({ ...s, pokemon: { loading: false, error: null } })) } })
      .catch(err => { if (!cancelled) setListStatus(s => ({ ...s, pokemon: { loading: false, error: describeError(err, 'the Pokémon list') } })) })
    return () => { cancelled = true }
  }, [listsReload])
  // Debounced so typing "garchomp" does not fire a request per letter. `loadPokemon` also resolves a plain species name
  // ("landorus") to the form PokeAPI accepts ("landorus-incarnate").
  useEffect(() => {
    if (!selectedName) { setPokemonData(null); setPokemonStatus({ loading: false, error: null, notFound: false, resolvedFrom: null }); return }
    let cancelled = false
    setPokemonStatus({ loading: true, error: null, notFound: false, resolvedFrom: null })
    const timer = setTimeout(async () => {
      try {
        const r = await loadPokemon(selectedName)
        if (cancelled) return
        if (r.status === 'ok') { setPokemonData(r.data); setPokemonStatus({ loading: false, error: null, notFound: false, resolvedFrom: r.resolvedFrom }) }
        else { setPokemonData(null); setPokemonStatus({ loading: false, error: null, notFound: true, resolvedFrom: null }) }
      } catch (err) {
        if (!cancelled) { setPokemonData(null); setPokemonStatus({ loading: false, error: describeError(err, `“${selectedName}”`), notFound: false, resolvedFrom: null }) }
      }
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [selectedName, pokemonReload])

  // Eviolite only works on a Pokémon that can still evolve. Looked up from PokeAPI's evolution chain; stays null
  // (= unknown, treated as "can evolve") until it arrives.
  const [userCanEvolve, setUserCanEvolve] = useState(null)
  const [userGenderRate, setUserGenderRate] = useState(null)
  useEffect(() => {
    setUserCanEvolve(null)
    if (!pokemonData) return
    let cancelled = false
    fetchCanEvolve(pokemonData).then(ce => { if (!cancelled) setUserCanEvolve(ce) })
    setUserGenderRate(null)
    fetchGenderRate(pokemonData).then(r => { if (!cancelled) setUserGenderRate(r) })
    return () => { cancelled = true }
  }, [pokemonData])
  // What the calculators see: the fetched species plus the evolution flag.
  const calcPokemon = useMemo(() => (pokemonData ? { ...pokemonData, canEvolve: userCanEvolve, genderRate: userGenderRate } : null), [pokemonData, userCanEvolve, userGenderRate])

  // Reset ability whenever a NEW species is chosen, so the auto-default effect below can re-fire.
  // A Showdown import changes the species AND fills the set; the new species' effect applies it instead of resetting.
  const pendingUserSet = useRef(null)
  function applyUserSet(p) {
    setUserAbility(p.ability || '')
    setUserItem(p.item || '')
    setUserMoves([0, 1, 2, 3].map(i => p.moves[i] ?? ''))
    setIvs(p.ivs)
    if (p.level) setRawLevel(p.level)
  }
  useEffect(() => {
    const p = pendingUserSet.current
    if (p) {
      pendingUserSet.current = null
      applyUserSet(p)
    } else {
      setUserAbility('')
      setUserMoves(['', '', '', ''])
      setUserItem('')
    }
    setLastHpPoints(0)
  }, [selectedName])

  async function importUserSet(text) {
    const sets = parseShowdown(text)
    if (!sets.length) return { ok: false, message: "Couldn't find a Pokémon set in that text." }
    const set = sets[0]
    const res = await resolveSpeciesSlug(set.species)
    if (!res.ok) return { ok: false, message: `Couldn't find "${set.species}" in PokeAPI (check the spelling / form name).` }
    const p = { ability: set.ability, item: set.item, moves: set.moves, ivs: set.ivs, level: championsMode ? null : set.level }
    if (res.slug === selectedName) applyUserSet(p)
    else { pendingUserSet.current = p; setSelectedName(res.slug) }
    invalidate()
    return { ok: true, message: `Imported ${res.slug}${sets.length > 1 ? ` (first of ${sets.length} sets)` : ''} — EVs and nature are chosen by the optimizer.` }
  }

  useEffect(() => {
    if (pokemonData && !userAbility) {
      setUserAbility(pokemonData.abilities[0]?.ability.name ?? '')
    }
  }, [pokemonData])

  // Auto-swap held item to the correct Mega Stone (or Primal orb) when the chosen species is a Mega/Primal form.
  useEffect(() => {
    if (pokemonData && MEGA_STONES[pokemonData.name]) {
      setUserItem(MEGA_STONES[pokemonData.name])
    }
  }, [pokemonData])

  // Keep opponents on the Field level preset without clobbering levels the user (or a Showdown import) set by hand:
  // only goals still sitting on the OLD preset follow it. Leaving Champions Mode resets everyone, because
  // Champions forces every opponent to Lv.50.
  const prevFieldLevel = useRef(battleConditions.fieldLevel)
  const prevChampions = useRef(championsMode)
  useEffect(() => {
    const prevLevel = prevFieldLevel.current, wasChampions = prevChampions.current
    const fieldLevel = battleConditions.fieldLevel
    prevFieldLevel.current = fieldLevel
    prevChampions.current = championsMode
    if (championsMode) return
    if (wasChampions) setGoals(prev => prev.map(g => ({ ...g, opponentLevel: fieldLevel })))
    else if (prevLevel !== fieldLevel) setGoals(prev => prev.map(g => g.opponentLevel === prevLevel ? { ...g, opponentLevel: fieldLevel } : g))
  }, [battleConditions.fieldLevel, championsMode])
  // A KO goal must not keep a move you no longer have: clear it (and everything derived from it) so Auto re-picks.
  useEffect(() => {
    const have = new Set(userMoves.filter(Boolean))
    setGoals(prev => {
      let changed = false
      const next = prev.map(g => {
        if (g.type !== 'ko' || !g.koMoveName || have.has(g.koMoveName)) return g
        changed = true
        return {
          ...g, koMoveName: '', koMoveManual: false,
          koMoveTypeName: undefined, koMovePower: undefined, koMoveOffKey: undefined, koMoveDefKey: undefined, koMoveHasSecondary: undefined,
          effectiveKoMoveTypeName: undefined, effectiveKoMovePower: undefined, effectiveKoMoveSpecial: undefined,
          koTypeMultiplier: undefined, koMoveHitCount: undefined, koMoveParentalBond: undefined, koMoveAbilityDamageMultiplier: undefined
        }
      })
      return changed ? next : prev
    })
  }, [userMoves])
  useEffect(() => {
    if (TERRAIN_ABILITIES[userAbility]) setCondition('terrain', TERRAIN_ABILITIES[userAbility])
    if (WEATHER_ABILITIES[userAbility]) setCondition('weather', WEATHER_ABILITIES[userAbility])
  }, [userAbility])
  // Any input change makes the shown result stale: drop it, and stop a search that is still running for the old inputs.
  const invalidate = useCallback(() => { optimizerClient.current?.cancel(); setResult(null); setOptimizeError(null) }, [])
  useEffect(() => {
    invalidate()
  }, [userAbility, userItem, userMoves, userStatStages, battleConditions, level, gameFormat, championsMode, dataGeneration, investInOffense, investInSpeed, userCanEvolve, lockedNature, pinned, invalidate])
  useEffect(() => () => optimizerClient.current?.dispose(), [])
  useEffect(() => {
    if (!userItem) { setUserItemSprite(null); return }
    const url = itemSpriteUrl(userItem)
    const img = new Image()
    img.onload = () => setUserItemSprite(url)
    img.onerror = () => setUserItemSprite(null)
    img.src = url
  }, [userItem])

  useEffect(() => {
    let cancelled = false
    async function fetchMoveInfo() {
      let failed = false
      const infos = await Promise.all(userMoves.map(async (name) => {
        if (!name) return null
        try {
          const data = await getMove(name) // cached; null = no such move (normal while typing)
          if (!data) return null
          return {
            name: data.name,
            type: data.type?.name ?? null,
            category: data.damage_class?.name ?? null,
            power: data.power ?? null
          }
        } catch { failed = true; return null }
      }))
      if (!cancelled) { setUserMoveInfo(infos); setMoveInfoError(failed ? "Couldn't load some move data (network problem). Edit a move to retry." : null) }
    }
    fetchMoveInfo()
    return () => { cancelled = true }
  }, [userMoves])

  // Foul Play uses the target's Attack, so it shouldn't count as a physical move for Attack investment.
  // Foul Play and fixed-damage moves (Seismic Toss, Super Fang...) don't scale with your offensive stats.
  const userMoveCategories = userMoveInfo.map(m => !m ? null : m.name === 'body-press' ? 'body-press' : m.name === 'foul-play' ? 'foul-play' : specialDamageKind(m.name, 100) ? 'fixed-damage' : (m.category ?? null))

  function addGoal(type) {
    const newGoal = {
      id: Date.now(), type, opponentName: '',
      opponentLevel: championsMode ? 50 : battleConditions.fieldLevel,
      opponentHpPercent: 100,
      ...(!championsMode && dataGeneration <= 2 ? { opponentEvs: { hp: 252, attack: 252, defense: 252, 'special-attack': 252, 'special-defense': 252, speed: 252 } } : {}), // Gens 1-2: stat exp is normally maxed
      ...(championsMode ? { opponentSp: { hp: 0, attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0 } } : {}),
      ...(type === 'ko' ? { koHits: 1 } : {}),
      ...(type === 'survive' ? { surviveHits: 1 } : {})
    }
    setGoals(prev => [...prev, newGoal])
    setActiveGoalId(newGoal.id)
    invalidate()
  }
  function updateGoal(id, changes) {
    setGoals(prev => prev.map(g => g.id === id ? { ...g, ...changes } : g))
    invalidate()
  }
  function removeGoal(id) {
    setGoals(prev => prev.filter(g => g.id !== id))
    setActiveGoalId(cur => cur === id ? null : cur)
    invalidate()
  }
  function setCondition(key, value) {
    setBattleConditions(prev => ({ ...prev, [key]: value }))
  }

  const activeGoal = goals.find(g => g.id === activeGoalId)
  // Evaluating every goal against the result (multi-hit breakdowns included) is the expensive part of rendering the
  // results, so it is computed once per result / input change instead of on every render.
  const postview = useMemo(() => {
    if (!result || result.infeasible || !calcPokemon) return null
    return championsMode
      ? evaluateAllGoalsChampions(goals, result, calcPokemon, userItem, userAbility, userStatStages, battleConditions, gameFormat)
      : evaluateAllGoals(goals, result, calcPokemon, result.ivs ?? ivs, level, userItem, userAbility, userStatStages, battleConditions, gameFormat)
  }, [goals, result, calcPokemon, ivs, level, userItem, userAbility, userStatStages, battleConditions, gameFormat, championsMode])

  async function runOptimize() {
    if (!pokemonData || optimizing) return
    const runId = ++runCounter.current
    setOptimizeError(null)
    setOptimizing(true)
    try {
      const resolved = await resolveGoals(goals, { pokemonData, userAbility, userItem, userStatStages, battleConditions, gameFormat, level, championsMode })
      // Merge only the fields computed here, so edits made while the type lookups were in flight
      // (or a goal deleted meanwhile) are not overwritten by this pre-await snapshot.
      setGoals(prev => mergeDerived(prev, resolved))
      const optimizerGoals = goalsForOptimizer(resolved, battleConditions)
      const pins = Object.fromEntries(Object.entries(pinned).filter(([, v]) => v !== '' && v != null))
      const options = { lockedNature: lockedNature || null, pinned: pins }
      const args = championsMode
        ? [calcPokemon, optimizerGoals, userMoveCategories, userItem, userAbility, battleConditions, gameFormat, userStatStages, investInOffense, investInSpeed, options]
        : [calcPokemon, ivs, level, optimizerGoals, userMoveCategories, userItem, userAbility, battleConditions, gameFormat, userStatStages, investInOffense, investInSpeed, options]
      // The search runs in a worker so the page stays responsive; starting another search cancels this one.
      optimizerClient.current ??= createOptimizerClient()
      const r = await optimizerClient.current.run(championsMode, args, dataGeneration)
      if (runId !== runCounter.current) return
      setResult(r)
      if (r.infeasible) return
      setLastHpPoints(championsMode ? r.spNeeded.hp : r.evsNeeded.hp)
    } catch (err) {
      if (err instanceof CancelledError) return
      console.error('optimizer failed:', err)
      if (runId === runCounter.current) { setResult(null); setOptimizeError(`The optimizer failed: ${err?.message ?? 'unknown error'}. Check the goals and try again.`) }
    } finally {
      if (runId === runCounter.current) setOptimizing(false)
    }
  }

  // Max HP for the HP bar: 0 EVs until the first Optimize, then the optimizer's HP investment.
  // Nature doesn't affect HP, so 'Hardy' is fine here.
  const yourMaxHp = pokemonData
    ? (() => {
        const base = pokemonData.stats.find(s => s.stat.name === 'hp').base_stat
        return championsMode
          ? calculateStatChampions('hp', base, lastHpPoints, 'Hardy')
          : calculateStat('hp', base, ivFor('hp', ivs), lastHpPoints, level, 'Hardy')
      })()
    : 100

  return (
    <div className="app-container">
      <h1 className="title">Pokémon EV Optimizer</h1>

      <GenerationSelect generation={generation} onChange={setGeneration} />

      <FieldPanel conditions={battleConditions} setCondition={setCondition} gameFormat={gameFormat} setGameFormat={setGameFormat} championsMode={championsMode} generation={dataGeneration} />

      <input list="pokemon-options" value={selectedName}
        onChange={(e) => setSelectedName(e.target.value.toLowerCase())}
        placeholder="Type a Pokémon name..."
        style={{ marginTop: 16 }} />
      <datalist id="pokemon-options">{pokemonList.map((p) => <option key={p.name} value={p.name} />)}</datalist>
      <ApiStatus loading={listStatus.pokemon.loading || listStatus.items.loading} loadingText="Loading Pokémon and item lists…"
        error={listStatus.pokemon.error || listStatus.items.error} onRetry={() => setListsReload(n => n + 1)} />
      <ApiStatus loading={pokemonStatus.loading && !!selectedName} loadingText={`Looking up “${selectedName}”…`}
        error={pokemonStatus.error} onRetry={() => setPokemonReload(n => n + 1)} />
      {selectedName && !pokemonStatus.loading && !pokemonStatus.error && pokemonStatus.notFound && (
        <p className="hint-text">No Pokémon called “{selectedName}” — keep typing, or pick one from the list.</p>
      )}
      {pokemonData && pokemonStatus.resolvedFrom && (
        <p className="hint-text">“{pokemonStatus.resolvedFrom}” has several forms; using <strong>{pokemonData.name}</strong>.</p>
      )}
      <ShowdownImport label="Import your set from Showdown" onImport={importUserSet}
        hint="Fills species, ability, item, moves, IVs and level. EVs / nature are ignored — the optimizer picks them." />

      {pokemonData && generationReady && (
        <div>
          <div className="pokemon-header">
            {pokemonData.sprites?.front_default && <img src={pokemonData.sprites.front_default} alt={pokemonData.name} className="sprite-large" />}
            <h2>{pokemonData.name}</h2>
          </div>

          <div className="editor-card">
            <h3>Your Set</h3>
            <div className="field-row">
              <label>Level:</label>
              {championsMode ? (
                <span className="stat-pill">50 (Champions)</span>
              ) : (
                <input type="number" min="1" max="100" value={rawLevel}
                  onChange={(e) => setRawLevel(Number(e.target.value))} />
              )}
              <span className="hint-text">
                {championsMode ? 'Locked to 50 in Champions Mode' : "(overrides the Field panel's preset — e.g. Level 99)"}
              </span>
            </div>
            {dataGeneration >= 3 && <div className="field-row">
              <label>Ability:</label>
              <select value={userAbility} onChange={(e) => setUserAbility(e.target.value)}>
                <option value="">-- none --</option>
                {pokemonData.abilities.map(a => <option key={a.ability.name} value={a.ability.name}>{a.ability.name}</option>)}
              </select>
            </div>}

            {(championsMode || dataGeneration >= 2) && <div className="field-row">
              <label>Item:</label>
              <input list="user-item-options" value={userItem}
                onChange={(e) => setUserItem(e.target.value.toLowerCase().replace(/ /g, '-'))} />
              {userItemSprite && <img src={userItemSprite} alt="" className="sprite-tiny" />}
            </div>}
            <datalist id="user-item-options">{itemList.map(i => <option key={i.name} value={i.name} />)}</datalist>

            <div className="field-row">
              <label>Moves:</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[0, 1, 2, 3].map(i => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input list="user-move-options" value={userMoves[i]} placeholder={`Move ${i + 1}`}
                      onChange={(e) => {
                        const copy = [...userMoves]
                        copy[i] = e.target.value.toLowerCase().replace(/ /g, '-')
                        setUserMoves(copy)
                      }} />
                    {userMoveInfo[i] && (() => {
                      const info = userMoveInfo[i]
                      const eff = resolveEffectiveMove(info.name, info.type, info.power, battleConditions.weather, {
                        attackerAbility: userAbility,
                        attackerStatus: battleConditions.yourStatus,
                        attackerStages: userStatStages,
                        attackerHpPercent: battleConditions.yourHpPercent,
                        attackerItem: battleConditions.magicRoom ? '' : userItem,
                        attackerLevel: level,
                        gameFormat
                        // Weight/speed-dependent moves (Low Kick, Grass Knot, Gyro Ball, Electro Ball)
                        // and target-HP moves (Crush Grip, Wring Out) have no single target here, so this
                        // preview tag assumes a full-HP, status-free target.
                      })
                      // abilityDamageMultiplier (the -ate/Normalize boost) is applied as a late-stage
                      // damage multiplier in the real calc, not baked into power — but for this quick
                      // preview tag it's fine to fold it in just for display.
                      const displayPower = eff.power ? Math.round(eff.power * eff.abilityDamageMultiplier) : eff.power
                      return (
                        <span className="move-tag">
                          {eff.type}{eff.type !== info.type ? ` (was ${info.type})` : ''} · {info.category}
                          {displayPower ? ` · ${displayPower} BP` : ''}
                          {eff.hitCount > 1 ? ` ×${eff.hitCount}` : ''}
                          {eff.special ? (eff.special.kind === 'fixed' ? ` · ${eff.special.amount} fixed dmg` : eff.special.kind === 'ohko' ? ' · OHKO' : ' · halves HP') : ''}
                          {info.name === 'body-press' ? ' · uses Defense' : ''}
                          {info.name === 'foul-play' ? " · uses target's Attack" : ''}
                        </span>
                      )
                    })()}
                  </div>
                ))}
              </div>
            </div>
            <div className="field-row">
              <label>Stat stages:</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(dataGeneration === 1 && !championsMode ? ['attack', 'defense', 'special', 'speed'] : ['attack', 'defense', 'special-attack', 'special-defense', 'speed']).map(key => ( // Gen 1 has one Special stage
                  <div key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ fontSize: 11 }}>{key}</span>
                    <input type="number" min="-6" max="6" style={{ width: 45 }}
                      value={key === 'special' ? userStatStages['special-attack'] : userStatStages[key]}
                      onChange={(e) => { const v = clampStage(Number(e.target.value)); setUserStatStages(key === 'special' ? { ...userStatStages, 'special-attack': v, 'special-defense': v } : { ...userStatStages, [key]: v }) }} />
                  </div>
                ))}
              </div>
            </div>

            <HpBar
              label={`${pokemonData.name} HP`}
              percent={battleConditions.yourHpPercent}
              onPercentChange={(v) => setCondition('yourHpPercent', v)}
              status={battleConditions.yourStatus}
              onStatusChange={(s) => setCondition('yourStatus', s)}
              maxHp={yourMaxHp}
            />
            <datalist id="user-move-options">{pokemonData.moves.map(m => <option key={m.move.name} value={m.move.name} />)}</datalist>
          </div>

          <div className="tabs">
            {goals.map(g => (
              <button key={g.id} className={`tab-button ${g.id === activeGoalId ? 'active' : ''}`} onClick={() => setActiveGoalId(g.id)}>
                {g.opponentSprite && <img src={g.opponentSprite} alt="" className="sprite-tiny" />}
                {g.type}{g.type === 'ko' && g.koHits > 1 ? ` (${g.koHits}HKO)` : ''}{g.type === 'survive' && g.surviveHits > 1 ? ` (${g.surviveHits} hits)` : ''}{g.opponentName ? `: ${g.opponentName}` : ''}
                <span className="tab-close" onClick={(e) => { e.stopPropagation(); removeGoal(g.id) }}> ✕</span>
              </button>
            ))}
            <button className="add-tab-button" onClick={() => addGoal('outspeed')}>+ Outspeed</button>
            <button className="add-tab-button" onClick={() => addGoal('survive')}>+ Survive</button>
            <button className="add-tab-button" onClick={() => addGoal('ko')}>+ KO</button>
          </div>

          {activeGoal && (
            <OpponentEditor
              key={activeGoal.id}
              goal={activeGoal} updateGoal={updateGoal} itemList={itemList} userMoves={userMoves}
              userMoveInfo={userMoveInfo}
              pokemonData={pokemonData} championsMode={championsMode} gameFormat={gameFormat}
              battleConditions={battleConditions} setCondition={setCondition}
              userAbility={userAbility} userItem={userItem}
            />
          )}
          <div className="field-row" style={{ marginTop: 20 }}>
            <button
              className={`pill-toggle ${investInOffense ? 'on' : ''}`}
              onClick={() => setInvestInOffense(!investInOffense)}
            >
              {investInOffense ? '⚔️ Dump extra into Attack/Sp. Atk' : '🛡️ Keep extra out of offense'}
            </button>
          </div>
          <div className="field-row" style={{ marginTop: 20 }}>
            <button
              className={`pill-toggle ${investInSpeed ? 'on' : ''}`}
              onClick={() => setInvestInSpeed(!investInSpeed)}
            >
              {investInSpeed ? '💨 Dump extra into Speed' : '🐌 Keep extra out of Speed'}
            </button>
          </div>
          <OptimizerOptions lockedNature={lockedNature} setLockedNature={setLockedNature} pinned={pinned} setPinned={setPinned} championsMode={championsMode} generation={dataGeneration} />
          {moveInfoError && <ApiStatus error={moveInfoError} />}
          <button className="optimize-button" onClick={runOptimize} disabled={optimizing}>
            {optimizing ? 'Optimizing…' : 'Optimize'}
          </button>
          {optimizing && (
            <button type="button" className="pill-toggle cancel-button" onClick={() => optimizerClient.current?.cancel()}>Cancel</button>
          )}
          <ApiStatus error={optimizeError} />

          {result?.infeasible && (
            <div className="editor-card">
              <p className="damage-box danger">
                {result.reason === 'pins-exceed-budget'
                  ? `The ${championsMode ? 'SP' : 'EVs'} you pinned add up to more than the ${championsMode ? '66 SP' : '510 EVs'} available. Lower a pinned value or clear the options.`
                  : result.reason === 'options-conflict'
                    ? 'Nothing fits with the nature / pinned values you chose, even with every goal removed. Loosen those options.'
                    : `No spread could be built within ${championsMode ? '66 SP' : '510 EVs'}. Try removing a goal or clearing the optimizer options.`}
              </p>
            </div>
          )}

          <ResultsView result={result && !result.infeasible ? result : null} postview={postview} goals={goals}
            pokemonData={pokemonData} ivs={ivs} level={level} championsMode={championsMode} />
        </div>
      )}
    </div>
  )
}
export default App
