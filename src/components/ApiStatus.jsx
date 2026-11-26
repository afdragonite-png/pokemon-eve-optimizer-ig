// A one-line loading / error note for anything fetched from PokeAPI. Errors get a Retry button.
export default function ApiStatus({ loading, error, onRetry, loadingText = 'Loading…', style }) {
  if (error) {
    return (
      <p className="damage-box danger api-status" role="alert" style={style}>
        <span>{error}</span>
        {onRetry && <button type="button" className="pill-toggle on" onClick={onRetry}>Retry</button>}
      </p>
    )
  }
  if (loading) return <p className="hint-text api-status" role="status" style={style}>⏳ {loadingText}</p>
  return null
}
