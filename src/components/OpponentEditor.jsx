import { useState, useEffect } from 'react'
import { calculateStat, calculateStatChampions, ivFor, evFor, NATURES, STAT_KEYS, 
  offensiveStatForMove, defensiveStatForMove, getTypeMultiplier, 
  roundToEVStep, roundToSPStep, clampStage, itemSpriteUrl, 
  MEGA_STONES, multiHitInfo, hitCountOptions, defaultHitCount, hasSecondaryEffect,
  ALWAYS_CRIT_MOVES, SPREAD_MOVES, fetchCanEvolve, fetchGenderRate, PRIORITY_LEVELS, DEFAULT_PRIORITY } from '../lib/pokemonMath'
import { loadPokemon, getMove, describeError } from '../lib/pokeapi'
import ApiStatus from './ApiStatus'
import { activeGeneration } from '../lib/generation'
import { moveTypeMultiplier } from '../lib/goalResolver'
import HpBar from './HpBar'
import ShowdownImport from './ShowdownImport'
// Must match the file name exactly (lib/showdownparser.js, all lowercase) so it also builds on case-sensitive systems.
import { parseShowdown, resolveSpeciesSlug, evsToSp } from '../lib/showdownparser'

// Debounced, cached PokeAPI lookup of one move. enabled=false clears it. Network errors surface with a retry; an unknown name is just null.
function useMove(name, enabled) {
  const [state, setState] = useState({ data: null, loading: false, error: null })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!enabled || !name) { setState({ data: null, loading: false, error: null }); return }
    let cancelled = false
    setState(s => ({ ...s, loading: true, error: null }))
    const t = setTimeout(() => {
      getMove(name).then(data => {
        if (cancelled) return
        setState({ data: data && data.type && data.damage_class ? data : null, loading: false, error: null })
      }).catch(err => { if (!cancelled) setState({ data: null, loading: false, error: describeError(err, 'move data') }) })
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [name, enabled, tick])
  return { ...state, retry: () => setTick(n => n + 1) }
}

const STAGE_KEYS = ['attack', 'defense', 'special-attack', 'special-defense', 'speed']

// Hits-per-use selector for multi-hit moves (Bullet Seed, Triple Axel, Surging Strikes...). The default follows the
// attacker's ability / item (2, Skill Link = max, Loaded Dice = 4); the results screen lists every count anyway.
function HitCountPicker({ moveName, ability, item, value, onChange }) {
  const mh = multiHitInfo(moveName)
  if (!mh) return null
  const dflt = defaultHitCount(moveName, ability, item)
  const current = value ?? dflt
  const note = ability === 'skill-link' ? ' — Skill Link' : (item === 'loaded-dice' ? ' — Loaded Dice' : '')
  return (
    <div className="field-row">
      <label>Hits:</label>
      {mh.min === mh.max ? (
        <span className="stat-pill">{mh.max} (fixed)</span>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {hitCountOptions(moveName).map(n => (
            <button key={n} type="button" className={`pill-toggle ${current === n ? 'on' : ''}`} onClick={() => onChange(n)}>{n}</button>
          ))}
        </div>
      )}
      {mh.min !== mh.max && <span className="hint-text">default {dflt}{note}; results show every count</span>}
    </div>
  )
}

// Extra yes/no inputs for moves whose power depends on the battle situation.
function MoveConditionPicker({ moveName, value, onChange }) {
  const v = value ?? {}
  const set = (patch) => onChange({ ...v, ...patch })
  const toggle = (label, key) => (
    <div className="field-row">
      <label>{label}:</label>
      <button type="button" className={`pill-toggle ${v[key] ? 'on' : ''}`} onClick={() => set({ [key]: !v[key] })}>{v[key] ? 'Yes (double power)' : 'No'}</button>
    </div>
  )
  if (moveName === 'assurance') return toggle('Target already hurt this turn', 'damaged')
  if (moveName === 'payback') return toggle('Moves after the target', 'after')
  if (moveName === 'retaliate') return toggle('Ally fainted last turn', 'allyFainted')
  if (moveName === 'last-respects') {
    return (
      <div className="field-row">
        <label>Fainted allies:</label>
        <div style={{ display: 'flex', gap: 6 }}>
          {[0, 1, 2, 3, 4, 5].map(n => (
            <button key={n} type="button" className={`pill-toggle ${(v.faintedAllies ?? 0) === n ? 'on' : ''}`} onClick={() => set({ faintedAllies: n })}>{n}</button>
          ))}
        </div>
        <span className="hint-text">{50 + 50 * (v.faintedAllies ?? 0)} BP</span>
      </div>
    )
  }
  return null
}

// Doubles only: a spread move loses 25% only while it hits two targets. Lets the user say only one is left.
function TargetPicker({ moveName, gameFormat, singleTarget, onChange }) {
  if (gameFormat !== 'doubles' || !SPREAD_MOVES.has(moveName)) return null
  return (
    <div className="field-row">
      <label>Targets hit:</label>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" className={`pill-toggle ${!singleTarget ? 'on' : ''}`} onClick={() => onChange(false)}>2 targets (×0.75)</button>
        <button type="button" className={`pill-toggle ${singleTarget ? 'on' : ''}`} onClick={() => onChange(true)}>1 target</button>
      </div>
    </div>
  )
}

export default function OpponentEditor({ goal, updateGoal, itemList, userMoves = [], userMoveInfo = [], pokemonData, championsMode, gameFormat = 'singles', battleConditions, setCondition, userAbility, userItem }) {
  const [opponentData, setOpponentData] = useState(null)
  const [moveList, setMoveList] = useState([])
  const [typeMultiplier, setTypeMultiplier] = useState(1)
  const [opponentItemSprite, setOpponentItemSprite] = useState(null)
  const [oppStatus, setOppStatus] = useState({ loading: false, error: null, notFound: false })
  const [formHint, setFormHint] = useState(null) // { from, to } when a typed species was resolved to its default form
  const [oppTick, setOppTick] = useState(0)

  useEffect(() => {
    if (!goal.opponentName) { setOpponentData(null); setOppStatus({ loading: false, error: null, notFound: false }); return }
    let cancelled = false
    setOppStatus({ loading: true, error: null, notFound: false })
    // Debounced so typing "garchomp" does not fire a request per keystroke.
    const timer = setTimeout(() => {
      loadPokemon(goal.opponentName).then(res => {
        if (cancelled) return
        if (res.status !== 'ok' || !Array.isArray(res.data.moves)) {
          setOpponentData(null)
          setOppStatus({ loading: false, error: null, notFound: true })
          return
        }
        const data = res.data
        setOppStatus({ loading: false, error: null, notFound: false })
        if (res.resolvedFrom) {
          // "landorus" -> "landorus-incarnate": store the name PokeAPI accepts so everything downstream agrees.
          setFormHint({ from: res.resolvedFrom, to: data.name })
          updateGoal(goal.id, { opponentName: data.name })
          return
        }
        setOpponentData(data)
        setMoveList(data.moves.map(m => m.move.name))
        const baseSpeed = data.stats.find(s => s.stat.name === 'speed').base_stat
        updateGoal(goal.id, {
          opponentBaseSpeed: baseSpeed,
          opponentWeightKg: (data.weight ?? 0) / 10, // PokeAPI weight is in hectograms — for Low Kick/Grass Knot
          opponentSprite: data.sprites?.front_default ?? null,
          opponentAbility: goal.pendingAbility || (data.abilities[0]?.ability.name ?? ''),
          pendingAbility: null,
          opponentCanEvolve: null, // unknown until the evolution chain arrives (Eviolite)
          opponentGenderRate: null, // for Rivalry; unknown counts as male
          ...(MEGA_STONES[data.name] ? { opponentItem: MEGA_STONES[data.name] } : {})
        })
        fetchCanEvolve(data).then(ce => { if (!cancelled) updateGoal(goal.id, { opponentCanEvolve: ce }) }).catch(() => {})
        fetchGenderRate(data).then(r => { if (!cancelled) updateGoal(goal.id, { opponentGenderRate: r }) }).catch(() => {})
      }).catch(err => {
        if (cancelled) return
        setOpponentData(null)
        setOppStatus({ loading: false, error: describeError(err, 'this Pokémon'), notFound: false })
      })
    }, 350)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [goal.opponentName, oppTick])

  useEffect(() => {
    if (!goal.opponentItem) { setOpponentItemSprite(null); return }
    const url = itemSpriteUrl(goal.opponentItem)
    const img = new Image()
    img.onload = () => setOpponentItemSprite(url)
    img.onerror = () => setOpponentItemSprite(null)
    img.src = url
  }, [goal.opponentItem])

  const survMove = useMove(goal.moveName, goal.type === 'survive')
  const koMove = useMove(goal.koMoveName, goal.type === 'ko')
  const moveData = survMove.data, koMoveData = koMove.data
  const moveStatus = goal.type === 'survive' ? survMove : koMove

  useEffect(() => {
    // Survive goal: the OPPONENT is attacking you, so the opponent's stats decide which of
    // Attack/Sp. Atk gets used for stat-dependent moves like Photon Geyser.
    if (goal.type !== 'survive' || !moveData || !opponentData) return
    const offKey = offensiveStatForMove(moveData, opponentData)
    const defKey = defensiveStatForMove(moveData, offKey)
    const attackBase = offKey ? opponentData.stats.find(s => s.stat.name === offKey).base_stat : null
    updateGoal(goal.id, {
      moveOffKey: offKey, moveDefKey: defKey, movePower: moveData.power,
      moveTypeName: moveData.type.name, moveHasSecondary: hasSecondaryEffect(moveData), opponentAttackBase: attackBase,
      opponentBaseStats: Object.fromEntries(opponentData.stats.map(x => [x.stat.name, x.base_stat])),
      opponentTypes: opponentData.types.map(t => t.type.name)
    })
  }, [goal.type, moveData, opponentData])

  useEffect(() => {
    if (goal.type !== 'survive') return
    updateGoal(goal.id, { goalTypeMultiplier: typeMultiplier })
  }, [typeMultiplier, goal.type])

  useEffect(() => {
    // KO goal: YOU are attacking the opponent, so your own stats decide the same choice.
    if (goal.type !== 'ko' || !koMoveData || !opponentData) return
    const offKey = offensiveStatForMove(koMoveData, pokemonData)
    const defKey = defensiveStatForMove(koMoveData, offKey)
    const defBase = defKey ? opponentData.stats.find(s => s.stat.name === defKey).base_stat : null
    const hpBase = opponentData.stats.find(s => s.stat.name === 'hp').base_stat
    updateGoal(goal.id, {
      koMoveOffKey: offKey, koMoveDefKey: defKey, koMovePower: koMoveData.power,
      koMoveTypeName: koMoveData.type.name, koMoveHasSecondary: hasSecondaryEffect(koMoveData), opponentDefBase: defBase, opponentHPBase: hpBase,
      opponentBaseStats: Object.fromEntries(opponentData.stats.map(x => [x.stat.name, x.base_stat])),
      opponentAtkBase: opponentData.stats.find(s => s.stat.name === 'attack').base_stat, // Foul Play uses the target's Attack
      opponentTypes: opponentData.types.map(t => t.type.name)
    })
  }, [goal.type, koMoveData, opponentData, pokemonData])

  useEffect(() => {
    if (goal.type !== 'ko') return
    updateGoal(goal.id, { koTypeMultiplier: typeMultiplier })
  }, [typeMultiplier, goal.type])

  useEffect(() => {
    async function run() {
      if (goal.type === 'survive' && moveData && pokemonData) {
        setTypeMultiplier(await moveTypeMultiplier(moveData.name, moveData.type.name, pokemonData.types.map(t => t.type.name)))
      } else if (goal.type === 'ko' && koMoveData && opponentData) {
        setTypeMultiplier(await moveTypeMultiplier(koMoveData.name, koMoveData.type.name, opponentData.types.map(t => t.type.name)))
      }
    }
    run()
  }, [goal.type, moveData, koMoveData, opponentData, pokemonData])
  // Auto-pick the strongest move vs this opponent (power x STAB x type matchup), unless one was chosen by hand
  useEffect(() => {
    if (goal.type !== 'ko' || goal.koMoveManual || !opponentData || !pokemonData) return
    let cancelled = false
    async function pick() {
      const myTypes = pokemonData.types.map(t => t.type.name)
      const theirTypes = opponentData.types.map(t => t.type.name)
      let best = null, bestScore = 0
      for (const m of userMoveInfo) {
        if (!m || !m.power || m.category === 'status') continue
        const mult = await moveTypeMultiplier(m.name, m.type, theirTypes)
        const score = m.power * (myTypes.includes(m.type) ? 1.5 : 1) * mult
        if (score > bestScore) { best = m.name; bestScore = score }
      }
      if (!cancelled && best && best !== goal.koMoveName) updateGoal(goal.id, { koMoveName: best })
    }
    pick()
    return () => { cancelled = true }
  }, [goal.type, goal.koMoveManual, opponentData, pokemonData, userMoveInfo])
  // Keep opponent locked to Level 50 whenever Champions Mode is active
  useEffect(() => {
    if (championsMode && goal.opponentLevel !== 50) {
      updateGoal(goal.id, { opponentLevel: 50 })
    }
  }, [championsMode, goal.opponentLevel])

  async function importOpponentSet(text) {
    const sets = parseShowdown(text)
    if (!sets.length) return { ok: false, message: "Couldn't find a Pokémon set in that text." }
    const set = sets[0]
    const res = await resolveSpeciesSlug(set.species)
    if (!res.ok) return { ok: false, message: `Couldn't find "${set.species}" in PokeAPI (check the spelling / form name).` }
    const sameSpecies = res.slug === goal.opponentName
    updateGoal(goal.id, {
      opponentName: res.slug,
      // A new species' load resets the ability to its first one, so hand the imported ability over through pendingAbility.
      ...(sameSpecies ? { opponentAbility: set.ability } : { pendingAbility: set.ability }),
      opponentItem: set.item,
      opponentNature: set.nature ?? 'Hardy',
      opponentIvs: set.ivs,
      opponentEvs: set.evs,
      opponentSp: evsToSp(set.evs),
      ...(championsMode || !set.level ? {} : { opponentLevel: set.level }),
      importedMoves: set.moves,
      // Survive goals attack with the opponent's move: start with the first imported one.
      ...(goal.type === 'survive' && set.moves[0] ? { moveName: set.moves[0] } : {})
    })
    return { ok: true, message: `Imported ${res.slug}${sets.length > 1 ? ` (first of ${sets.length} sets)` : ''}.` }
  }

  const level = goal.opponentLevel ?? 100
  const nature = goal.opponentNature ?? 'Hardy'
  const ivs = goal.opponentIvs ?? Object.fromEntries(STAT_KEYS.map(k => [k, 31]))
  const evs = goal.opponentEvs ?? Object.fromEntries(STAT_KEYS.map(k => [k, !championsMode && activeGeneration() <= 2 ? 252 : 0])) // Gens 1-2: stat exp is normally maxed
  const sp = goal.opponentSp ?? Object.fromEntries(STAT_KEYS.map(k => [k, 0]))
  const stages = goal.opponentStages ?? Object.fromEntries(STAGE_KEYS.map(k => [k, 0]))

  let statsToShow = []
  if (goal.type === 'outspeed') statsToShow = ['speed']
  if (goal.type === 'survive') statsToShow = goal.moveOffKey === 'defense' ? ['defense'] : ['attack', 'special-attack']
  if (goal.type === 'ko') statsToShow = goal.koMoveName === 'foul-play' ? ['hp', 'attack', 'defense'] : ['hp', 'defense', 'special-defense']

  function opponentStat(key) {
    const s = opponentData.stats.find(s => s.stat.name === key)
    if (championsMode) return calculateStatChampions(key, s.base_stat, sp[key] ?? 0, nature)
    return calculateStat(key, s.base_stat, ivFor(key, ivs), evFor(key, evs) ?? 0, level, nature)
  }
  const oldGen = !championsMode && activeGeneration() <= 2 // Gens 1-2: DVs (0-15), one shared Special stat, no natures

  function renderStatRow(key) {
    const s = opponentData.stats.find(s => s.stat.name === key)

    if (championsMode) {
      return (
        <tr key={key}>
          <td>{key}</td>
          <td>{s.base_stat}</td>
          <td colSpan={2}>
            <input type="number" min="0" max="32" value={sp[key] ?? 0}
              onChange={(e) => updateGoal(goal.id, { opponentSp: { ...sp, [key]: roundToSPStep(Number(e.target.value)) } })} /> SP
          </td>
          <td><span className="stat-pill">{opponentStat(key)}</span></td>
        </tr>
      )
    }

    if (oldGen) {
      const shared = key === 'special-defense' // shares the Special DV / stat exp with Special Attack
      const src = shared ? 'special-attack' : key
      const dv = key === 'hp' ? Math.floor(ivFor('hp', ivs) / 2) : Math.floor((ivs[src] ?? 31) / 2)
      return (
        <tr key={key}>
          <td>{activeGeneration() === 1 && (key === 'special-attack' || shared) ? 'special' : key}</td>
          <td>{s.base_stat}</td>
          <td><input type="number" min="0" max="15" value={dv} disabled={shared || key === 'hp'} title={key === 'hp' ? 'The HP DV comes from the other DVs' : shared ? 'Shared with Special Attack' : 'DV'}
            onChange={(e) => updateGoal(goal.id, { opponentIvs: { ...ivs, [key]: Math.max(0, Math.min(15, Number(e.target.value))) * 2 + 1 } })} /></td>
          <td><input type="number" min="0" max="252" step="4" value={evFor(key, evs) ?? 0} disabled={shared} title={shared ? 'Shared with Special Attack' : 'Stat experience'}
            onChange={(e) => updateGoal(goal.id, { opponentEvs: { ...evs, [key]: roundToEVStep(Number(e.target.value)) } })} /></td>
          <td><span className="stat-pill">{opponentStat(key)}</span></td>
        </tr>
      )
    }

    return (
      <tr key={key}>
        <td>{key}</td>
        <td>{s.base_stat}</td>
        <td><input type="number" min="0" max="31" value={ivs[key]}
          onChange={(e) => updateGoal(goal.id, { opponentIvs: { ...ivs, [key]: Number(e.target.value) } })} /></td>
        <td><input type="number" min="0" max="252" step="4" value={evs[key]}
          onChange={(e) => updateGoal(goal.id, { opponentEvs: { ...evs, [key]: roundToEVStep(Number(e.target.value)) } })} /></td>
        <td><span className="stat-pill">{opponentStat(key)}</span></td>
      </tr>
    )
  }

  function renderStageInputs() {
    const keysToShow = goal.type === 'outspeed' ? ['speed'] : (!championsMode && activeGeneration() === 1) ? ['attack', 'defense', 'special', 'speed'] : STAGE_KEYS // Gen 1: one Special stage
    return (
      <div className="field-row">
        <label>Opponent stages:</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {keysToShow.map(key => (
            <div key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: 11 }}>{key}</span>
              <input type="number" min="-6" max="6" style={{ width: 45 }}
                value={key === 'special' ? (stages['special-attack'] ?? 0) : (stages[key] ?? 0)}
                onChange={(e) => { const v = clampStage(Number(e.target.value)); updateGoal(goal.id, { opponentStages: key === 'special' ? { ...stages, 'special-attack': v, 'special-defense': v } : { ...stages, [key]: v } }) }} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="editor-card">
      <h4>Opposing Pokémon</h4>

      <ShowdownImport label="Import opponent's set from Showdown" onImport={importOpponentSet}
        hint="Fills species, ability, item, nature, EVs / IVs, level and moves." />

      <div className="field-row">
        <label>Species:</label>
        <input list="pokemon-options" value={goal.opponentName}
          onChange={(e) => updateGoal(goal.id, { opponentName: e.target.value.toLowerCase() })} />
        {opponentData?.sprites?.front_default && (
          <img src={opponentData.sprites.front_default} alt={goal.opponentName} className="sprite-medium" />
        )}
      </div>
      <ApiStatus loading={oppStatus.loading} error={oppStatus.error} onRetry={() => setOppTick(n => n + 1)} loadingText="Loading Pokémon…" />
      {!oppStatus.loading && !oppStatus.error && oppStatus.notFound && goal.opponentName && (
        <p className="hint-text">No Pokémon named “{goal.opponentName}” — check the spelling or form name (e.g. “landorus-therian”).</p>
      )}
      {formHint && formHint.to === goal.opponentName && !oppStatus.error && (
        <p className="hint-text">“{formHint.from}” isn’t a form name on PokeAPI, so using <strong>{formHint.to}</strong> (its default form).</p>
      )}
      <ApiStatus loading={moveStatus.loading} error={moveStatus.error} onRetry={moveStatus.retry} loadingText="Loading move…" />

      <div className="field-row">
        <label htmlFor={`prio-${goal.id}`}>Priority:</label>
        <select id={`prio-${goal.id}`} value={goal.priority ?? ''} onChange={(e) => updateGoal(goal.id, { priority: e.target.value === '' ? undefined : Number(e.target.value) })}>
          <option value="">Default ({DEFAULT_PRIORITY[goal.type] ?? 3})</option>
          {PRIORITY_LEVELS.map(n => <option key={n} value={n}>{n}{n === 1 ? ' (give up first)' : n === 5 ? ' (keep at all costs)' : ''}</option>)}
        </select>
        <span className="hint-text">If not every goal fits, lower-priority goals are relaxed or dropped first.</span>
      </div>

      {opponentData && (
        <>
          <div className="field-row">
            <label>Level:</label>
            {championsMode ? (
              <span className="stat-pill">50 (Champions)</span>
            ) : (
              <input type="number" min="1" max="100" value={level}
                onChange={(e) => updateGoal(goal.id, { opponentLevel: Number(e.target.value) })} />
            )}
          </div>

          {(championsMode || activeGeneration() >= 3) && <div className="field-row">
            <label>Ability:</label>
            <select value={goal.opponentAbility ?? ''} onChange={(e) => updateGoal(goal.id, { opponentAbility: e.target.value })}>
              <option value="">-- none --</option>
              {opponentData.abilities.map(a => <option key={a.ability.name} value={a.ability.name}>{a.ability.name}</option>)}
            </select>
          </div>}

          {goal.type === 'outspeed' && (
            <p className="hint-text">
              Choice Scarf, Tailwind, paralysis, stat stages and Quick Claw are applied automatically from your item / the Field / the opponent's inputs.
            </p>
          )}
          {goal.type === 'survive' && (
            <>
              <div className="field-row">
                <label>Move:</label>
                <input list={`moves-${goal.id}`} value={goal.moveName ?? ''} placeholder="e.g. earthquake"
                  onChange={(e) => updateGoal(goal.id, { moveName: e.target.value.toLowerCase().replace(/ /g, '-') })} />
              </div>
              <datalist id={`moves-${goal.id}`}>{moveList.map(m => <option key={m} value={m} />)}</datalist>
              {moveData && <p>Type: {moveData.type.name} | Power: {moveData.power ?? '—'} | Category: {moveData.damage_class.name}</p>}
              {goal.importedMoves?.length > 0 && (
                <div className="field-row">
                  <label>Imported moves:</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {goal.importedMoves.map(m => (
                      <button key={m} type="button" className={`pill-toggle ${goal.moveName === m ? 'on' : ''}`}
                        onClick={() => updateGoal(goal.id, { moveName: m })}>{m}</button>
                    ))}
                  </div>
                </div>
              )}
              <MoveConditionPicker moveName={goal.moveName} value={goal.moveCond}
                onChange={(c) => updateGoal(goal.id, { moveCond: c })} />
              <HitCountPicker moveName={goal.moveName} ability={goal.opponentAbility} item={goal.opponentItem}
                value={goal.moveHitOverride} onChange={(n) => updateGoal(goal.id, { moveHitOverride: n })} />
              <TargetPicker moveName={goal.moveName} gameFormat={gameFormat} singleTarget={!!goal.moveSingleTarget}
                onChange={(v) => updateGoal(goal.id, { moveSingleTarget: v })} />
              <div className="field-row">
                <label>Critical hit:</label>
                {(() => {
                  const alwaysCrit = ALWAYS_CRIT_MOVES.has(goal.moveName)
                  const on = alwaysCrit || !!battleConditions?.oppCrit
                  return (
                    <button type="button" disabled={alwaysCrit}
                      className={`pill-toggle ${on ? 'on' : ''}`}
                      onClick={() => setCondition('oppCrit', !battleConditions?.oppCrit)}>
                      {alwaysCrit ? '💥 Always crits' : on ? '💥 Their move crits' : 'No crit'}
                    </button>
                  )
                })()}
              </div>
              <div className="field-row">
                <label>Survive:</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[1, 2, 3].map(n => (
                    <button key={n} type="button"
                      className={`pill-toggle ${(goal.surviveHits ?? 1) === n ? 'on' : ''}`}
                      onClick={() => updateGoal(goal.id, { surviveHits: n })}>
                      {n === 1 ? '1 hit' : `${n} hits`}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {goal.type === 'ko' && (
            <>
              <div className="field-row">
                <label>Your move:</label>
                <select value={goal.koMoveName ?? ''} onChange={(e) => updateGoal(goal.id, { koMoveName: e.target.value, koMoveManual: true })}>
                  <option value="">-- choose --</option>
                  {userMoves.filter(Boolean).map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <button type="button" className={`pill-toggle ${!goal.koMoveManual ? 'on' : ''}`}
                  onClick={() => updateGoal(goal.id, { koMoveManual: false })}>Auto</button>
              </div>
              {userMoves.filter(Boolean).length === 0 && <p>Enter your moves in "Your Set" above first.</p>}
              {koMoveData && <p>Type: {koMoveData.type.name} | Power: {koMoveData.power ?? '—'} | Category: {koMoveData.damage_class.name}</p>}
              <MoveConditionPicker moveName={goal.koMoveName} value={goal.koMoveCond}
                onChange={(c) => updateGoal(goal.id, { koMoveCond: c })} />
              <HitCountPicker moveName={goal.koMoveName} ability={userAbility} item={userItem}
                value={goal.koHitOverride} onChange={(n) => updateGoal(goal.id, { koHitOverride: n })} />
              <TargetPicker moveName={goal.koMoveName} gameFormat={gameFormat} singleTarget={!!goal.koSingleTarget}
                onChange={(v) => updateGoal(goal.id, { koSingleTarget: v })} />
              <div className="field-row">
                <label>Critical hit:</label>
                {(() => {
                  const alwaysCrit = ALWAYS_CRIT_MOVES.has(goal.koMoveName)
                  const on = alwaysCrit || !!battleConditions?.yourCrit
                  return (
                    <button type="button" disabled={alwaysCrit}
                      className={`pill-toggle ${on ? 'on' : ''}`}
                      onClick={() => setCondition('yourCrit', !battleConditions?.yourCrit)}>
                      {alwaysCrit ? '💥 Always crits' : on ? '💥 Your move crits' : 'No crit'}
                    </button>
                  )
                })()}
              </div>
              <div className="field-row">
                <label>KO within:</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[1, 2, 3].map(n => (
                    <button key={n} type="button"
                      className={`pill-toggle ${(goal.koHits ?? 1) === n ? 'on' : ''}`}
                      onClick={() => updateGoal(goal.id, { koHits: n })}>
                      {n === 1 ? 'OHKO' : `${n}HKO`}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {statsToShow.length > 0 && (
            <table className="stat-table">
              <thead>
                <tr>
                  <th>Stat</th><th>Base</th>
                  {championsMode ? <th colSpan={2}>SP</th> : <><th>{oldGen ? 'DV' : 'IV'}</th><th>{oldGen ? 'Stat exp' : 'EV'}</th></>}
                  <th>Stat</th>
                </tr>
              </thead>
              <tbody>{statsToShow.map(key => renderStatRow(key))}</tbody>
            </table>
          )}

          {renderStageInputs()}

          <HpBar
            label={`${goal.opponentName} HP`}
            percent={goal.opponentHpPercent ?? 100}
            onPercentChange={(v) => updateGoal(goal.id, { opponentHpPercent: v })}
            status={battleConditions?.oppStatus ?? 'none'}
            onStatusChange={(s) => setCondition('oppStatus', s)}
            maxHp={opponentStat('hp')}
          />

          {!oldGen && activeGeneration() >= 3 && <div className="field-row">
            <label>Nature:</label>
            <select value={nature} onChange={(e) => updateGoal(goal.id, { opponentNature: e.target.value })}>
              {Object.keys(NATURES).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>}

          {(championsMode || activeGeneration() >= 2) && <div className="field-row">
            <label>Item:</label>
            <input list={`items-${goal.id}`} value={goal.opponentItem ?? ''} placeholder="e.g. choice-band"
              onChange={(e) => updateGoal(goal.id, { opponentItem: e.target.value.toLowerCase().replace(/ /g, '-') })} />
            {opponentItemSprite && <img src={opponentItemSprite} alt="" className="sprite-tiny" />}
          </div>}
          <datalist id={`items-${goal.id}`}>{itemList.map(i => <option key={i.name} value={i.name} />)}</datalist>

          <p className="hint-text">Results are revealed at the bottom after you click Optimize.</p>
        </>
      )}
    </div>
  )
}
