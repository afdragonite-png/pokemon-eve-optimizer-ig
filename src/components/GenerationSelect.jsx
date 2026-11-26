// Generation picker (Gen 1-9 + Pokémon Champions). Gen 9 and Champions are implemented; the other generations are shown but cannot be picked yet.
export const GENERATIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9]
export const CHAMPIONS = 'champions'
export const SUPPORTED_GENERATIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, CHAMPIONS]

export default function GenerationSelect({ generation, onChange }) {
  return (
    <div className="gen-select" role="radiogroup" aria-label="Generation">
      <span className="gen-select-label">Generation</span>
      <div className="gen-select-options">
        {GENERATIONS.map(g => {
          const supported = SUPPORTED_GENERATIONS.includes(g)
          const selected = generation === g
          return (
            <button key={g} type="button" role="radio" aria-checked={selected}
              className={`gen-option ${selected ? 'on' : ''}`} disabled={!supported}
              title={supported ? `Generation ${g}` : `Generation ${g} is coming soon`}
              onClick={() => supported && onChange(g)}>
              {g}
            </button>
          )
        })}
        <button type="button" role="radio" aria-checked={generation === CHAMPIONS}
          className={`gen-option gen-option-wide ${generation === CHAMPIONS ? 'on' : ''}`}
          title="Pokémon Champions (SP system, Level 50)" onClick={() => onChange(CHAMPIONS)}>
          Champions
        </button>
      </div>
    </div>
  )
}
