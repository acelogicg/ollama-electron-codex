export default function MessageTips({ tips, loading, disabled, onSelect }) {
  if (!loading && (!tips || !tips.length)) return null;

  return (
    <div className="message-tips" aria-label="Saran lanjutan">
      <span className="tips-label">Tips</span>
      <div className="tips-chips">
        {loading && (!tips || !tips.length)
          ? <span className="tips-loading">Menyiapkan saran…</span>
          : tips.map((tip) => (
            <button
              key={tip}
              type="button"
              className="tip-chip"
              onClick={() => onSelect(tip)}
              disabled={disabled}
              title={tip}
            >
              {tip}
            </button>
          ))}
      </div>
    </div>
  );
}
