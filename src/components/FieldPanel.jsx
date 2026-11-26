import { useState } from 'react'
const WEATHER = ['none', 'sun', 'rain', 'sand', 'snow', 'harsh-sunshine', 'heavy-rain', 'strong-winds']
const TERRAIN = ['none', 'electric', 'grassy', 'misty', 'psychic']
const ROOMS = ['magicRoom', 'wonderRoom', 'gravity']
const ROOM_LABELS = { magicRoom: 'Magic Room', wonderRoom: 'Wonder Room', gravity: 'Gravity' }

// Now wired into real damage/speed math via pokemonMath.js (totalHazardFraction, wonderRoomSwap,
// foresightAdjustedMultiplier, helpingHandMultiplier, flowerGiftMultiplier, powerTrickSwap, chargeMultiplier,
// burnDamageMultiplier, statusParalysisSpeedMultiplier, facadePowerMultiplier, abilityStatMultiplier's Guts term).
// Major status (BRN/PAR/PSN/TOX/SLP/FRZ) now lives under each Pokémon's HP bar (HpBar.jsx).
const STATUS_LABELS = {
  Protect: 'Protect', LeechSeed: 'Leech Seed', SaltCure: 'Salt Cure', Foresight: 'Foresight',
  FlowerGift: 'Flower Gift', PowerTrick: 'Power Trick',
  Charge: 'Charge', Nightmare: 'Nightmare', SwitchingOut: 'Switching Out'
}
const STATUS_LIST = ['Protect', 'LeechSeed', 'SaltCure', 'Foresight', 'FlowerGift', 'PowerTrick', 'Charge', 'Nightmare', 'SwitchingOut']
// The first generation each condition exists in (anything not listed exists from Gen 1).
export const FIELD_MIN_GEN = { Protect: 2, SaltCure: 9, Foresight: 2, FlowerGift: 4, PowerTrick: 4, Charge: 3, Nightmare: 2, StealthRock: 4, Tailwind: 4, HelpingHand: 3,
  FriendGuard: 5, trickRoom: 4, gravity: 4, magicRoom: 5, wonderRoom: 5, Spikes: 2 }
const existsIn = (key, gen) => gen >= (FIELD_MIN_GEN[key] ?? 1)

// What exists in each generation: terrains from Gen 6 (Psychic from Gen 7), primal weather from Gen 6, Aurora Veil and Battery
// from Gen 7, Power Spot and Steely Spirit from Gen 8.
const terrainsFor = (gen) => TERRAIN.filter(t => t !== 'none' && (t === 'psychic' ? gen >= 7 : gen >= 6))
const weathersFor = (gen) => WEATHER.filter(w => w !== 'none' && (gen === 1 ? false : gen === 2 ? (w === 'sun' || w === 'rain') : (['harsh-sunshine', 'heavy-rain', 'strong-winds'].includes(w) ? gen >= 6 : true)))

const cap = (str) => str.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
const SIDE_LABELS = {
  Spikes: null, StealthRock: 'Stealth Rock', Reflect: 'Reflect', LightScreen: 'Light Screen', AuroraVeil: 'Aurora Veil', Tailwind: 'Tailwind',
  FriendGuard: 'Friend Guard', Battery: 'Battery', PowerSpot: 'Power Spot', SteelySpirit: 'Steely Spirit', HelpingHand: 'Helping Hand', ...STATUS_LABELS
}

// Everything that differs from the default field, as short labels (shown in the collapsed bar and counted in the badge).
const weatherLabel = (w, gen) => (w === 'snow' && gen < 9 ? 'Hail' : w.split('-').map(x => x[0].toUpperCase() + x.slice(1)).join(' '))
function activeConditions(c, gameFormat, gen = 9) {
  const out = []
  if (gameFormat === 'doubles') out.push('Doubles')
  if (c.terrain && c.terrain !== 'none') out.push(`${cap(c.terrain)} Terrain`)
  if (c.weather && c.weather !== 'none') out.push(weatherLabel(c.weather, gen))
  if (c.trickRoom) out.push('Trick Room')
  for (const r of ROOMS) if (c[r]) out.push(ROOM_LABELS[r])
  for (const [prefix, who] of [['your', 'you'], ['opp', 'opp']]) {
    if (c[`${prefix}Spikes`] > 0) out.push(`Spikes ${c[`${prefix}Spikes`]} (${who})`)
    for (const [key, label] of Object.entries(SIDE_LABELS)) if (label && c[`${prefix}${key}`]) out.push(`${label} (${who})`)
  }
  return out
}

export default function FieldPanel({ conditions, setCondition, gameFormat, setGameFormat, championsMode, generation = 9 }) {
  const [open, setOpen] = useState(false)
  function toggle(key) {
    setCondition(key, !conditions[key])
  }
  const active = activeConditions(conditions, gameFormat, generation)
  const summary = active.length <= 2 ? active.join(' · ') : `${active.slice(0, 2).join(' · ')} +${active.length - 2} more`

  function renderSideColumn(side) {
    // side: 'your' | 'opp'
    const prefix = side
    const spikesKey = `${prefix}Spikes`
    const spikesVal = conditions[spikesKey] ?? 0

    return (
      <div className="field-side-column">
        <h4 className="field-side-title">{side === 'your' ? 'Your Side' : "Opponent's Side"}</h4>
        {existsIn('StealthRock', generation) && <button className={`pill-toggle ${conditions[`${prefix}StealthRock`] ? 'on' : ''}`}
          onClick={() => toggle(`${prefix}StealthRock`)}>
          Stealth Rock
        </button>}

        {existsIn('Spikes', generation) && <div className="spikes-row">
          {(generation === 2 ? [0, 1] : [0, 1, 2, 3]).map(n => (
            <button key={n} className={`pill-toggle spikes-num ${spikesVal === n ? 'on' : ''}`}
              onClick={() => setCondition(spikesKey, n)}>
              {n}
            </button>
          ))}
          <span className="spikes-label">Spikes</span>
        </div>}

        <div className="pill-pair">
          <button className={`pill-toggle ${conditions[`${prefix}Reflect`] ? 'on' : ''}`}
            onClick={() => toggle(`${prefix}Reflect`)}>Reflect</button>
          <button className={`pill-toggle ${conditions[`${prefix}LightScreen`] ? 'on' : ''}`}
            onClick={() => toggle(`${prefix}LightScreen`)}>Light Screen</button>
        </div>

        {generation >= 7 && (
          <button className={`pill-toggle full ${conditions[`${prefix}AuroraVeil`] ? 'on' : ''}`}
            onClick={() => toggle(`${prefix}AuroraVeil`)}>Aurora Veil</button>
        )}

        {existsIn('Tailwind', generation) && <button className={`pill-toggle full ${conditions[`${prefix}Tailwind`] ? 'on' : ''}`}
          onClick={() => toggle(`${prefix}Tailwind`)}>Tailwind</button>}

        {gameFormat === 'doubles' && generation >= 3 && (
          <>
            {existsIn('FriendGuard', generation) && <button className={`pill-toggle full ${conditions[`${prefix}FriendGuard`] ? 'on' : ''}`}
              onClick={() => toggle(`${prefix}FriendGuard`)}>Friend Guard (ally)</button>}
            {generation >= 7 && (
              <button className={`pill-toggle full ${conditions[`${prefix}Battery`] ? 'on' : ''}`}
                onClick={() => toggle(`${prefix}Battery`)}>Battery (ally)</button>
            )}
            {generation >= 8 && (
              <>
                <button className={`pill-toggle full ${conditions[`${prefix}PowerSpot`] ? 'on' : ''}`}
                  onClick={() => toggle(`${prefix}PowerSpot`)}>Power Spot (ally)</button>
                <button className={`pill-toggle full ${conditions[`${prefix}SteelySpirit`] ? 'on' : ''}`}
                  onClick={() => toggle(`${prefix}SteelySpirit`)}>Steely Spirit (ally)</button>
              </>
            )}
            <button className={`pill-toggle full ${conditions[`${prefix}HelpingHand`] ? 'on' : ''}`}
              onClick={() => toggle(`${prefix}HelpingHand`)}>Helping Hand (ally)</button>
          </>
        )}

        <div className="status-group">
          {STATUS_LIST.filter(key => existsIn(key, generation)).map(key => (
            <button key={key} className={`pill-toggle full ${conditions[`${prefix}${key}`] ? 'on' : ''}`}
              onClick={() => toggle(`${prefix}${key}`)}>
              {STATUS_LABELS[key]}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="editor-card field-panel">
      <button type="button" className={`field-toggle ${open ? 'open' : ''}`} aria-expanded={open} aria-controls="field-body"
        onClick={() => setOpen(!open)}>
        <span className="field-toggle-label">Field</span>
        {active.length > 0 && <span className="field-toggle-badge">{active.length} active</span>}
        <span className="field-toggle-summary">{summary || 'No conditions set'}</span>
        <span className="field-toggle-chevron" aria-hidden="true">▾</span>
      </button>

      <div id="field-body" className={`field-body ${open ? 'open' : ''}`} aria-hidden={!open} inert={!open}>
      <div className="field-body-inner">
        {generation >= 3 && <div className="field-toprow">
        <button className={`pill-toggle ${gameFormat === 'singles' ? 'on' : ''}`} onClick={() => setGameFormat('singles')}>Singles</button>
        <button className={`pill-toggle ${gameFormat === 'doubles' ? 'on' : ''}`} onClick={() => setGameFormat('doubles')}>Doubles</button>
        </div>}

      {!championsMode && (
        <div className="field-toprow">
          {[50, 100, 5].sort((a, b) => b - a).map(lvl => (
            <button key={lvl} className={`pill-toggle ${conditions.fieldLevel === lvl ? 'on' : ''}`}
              onClick={() => setCondition('fieldLevel', lvl)}>Level {lvl}</button>
          ))}
        </div>
      )}

      {terrainsFor(generation).length > 0 && <div className="field-toprow">
        {terrainsFor(generation).map(t => (
          <button key={t} className={`pill-toggle ${conditions.terrain === t ? 'on' : ''}`}
            onClick={() => setCondition('terrain', conditions.terrain === t ? 'none' : t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)} Terrain
          </button>
        ))}
      </div>}

      {weathersFor(generation).length > 0 && <div className="field-toprow">
        {weathersFor(generation).map(w => (
          <button key={w} className={`pill-toggle ${conditions.weather === w ? 'on' : ''}`}
            onClick={() => setCondition('weather', conditions.weather === w ? 'none' : w)}>
            {weatherLabel(w, generation)}
          </button>
        ))}
      </div>}

      {generation >= 4 && <div className="field-toprow">
        {existsIn('trickRoom', generation) && <button className={`pill-toggle ${conditions.trickRoom ? 'on' : ''}`}
          onClick={() => toggle('trickRoom')}>Trick Room</button>}
        {ROOMS.filter(r => existsIn(r, generation)).map(r => (
          <button key={r} className={`pill-toggle ${conditions[r] ? 'on' : ''}`}
            onClick={() => toggle(r)}>{ROOM_LABELS[r]}</button>
        ))}
      </div>}

      <div className="field-columns">
        {renderSideColumn('your')}
        {renderSideColumn('opp')}
      </div>

      <p className="field-legend">
        <span className="legend-dot wired"></span> affects damage/speed calculations
      </p>
      <p className="hint-text" style={{ margin: '4px 8px' }}>
        Leech Seed, Salt Cure and Nightmare chip at the end of each turn, so they only matter for Survive / KO goals that
        last more than one hit. Entry hazards (Stealth Rock, Spikes) apply at once; use the HP bar for HP already lost.
      </p>
      </div>
      </div>
    </div>
  )
}
