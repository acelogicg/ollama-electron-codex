export default function SettingsPage({ memoryEnabled, autoCompactContext, onMemoryChange, onAutoCompactChange }) {
  return (
    <section className="settings-page">
      <div className="settings-panel">
        <div className="settings-row">
          <div>
            <h2>Memory</h2>
            <p>Keep previous chat messages in the next request.</p>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={memoryEnabled}
              onChange={(event) => onMemoryChange(event.target.checked)}
            />
            <span />
          </label>
        </div>

        <div className="settings-row">
          <div>
            <h2>Auto compact context</h2>
            <p>Compress older chat history and keep recent turns focused.</p>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={autoCompactContext}
              onChange={(event) => onAutoCompactChange(event.target.checked)}
            />
            <span />
          </label>
        </div>
      </div>
    </section>
  );
}
