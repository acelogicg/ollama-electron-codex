function formatProgress(browserProgress) {
  if (!browserProgress) return 'Belum memuat model browser.';
  const percent = Number.isFinite(browserProgress.progress)
    ? `${Math.round(browserProgress.progress * 100)}%`
    : '';
  return [browserProgress.text, percent].filter(Boolean).join(' - ');
}

export default function SettingsPage({
  memoryEnabled,
  autoCompactContext,
  engineProvider,
  browserSupported,
  browserInitializing,
  browserProgress,
  browserGpuVendor,
  browserRuntimeStats,
  browserModel,
  browserModels,
  onMemoryChange,
  onAutoCompactChange,
  onEngineProviderChange,
  onBrowserModelChange
}) {
  return (
    <section className="settings-page">
      <div className="settings-panel">
        <div className="settings-row">
          <div>
            <h2>Inference engine</h2>
            <p>{browserSupported ? 'Pilih Ollama server atau inferensi browser via WebGPU.' : 'WebGPU tidak terdeteksi, browser inference akan nonaktif.'}</p>
          </div>
          <select
            value={engineProvider}
            onChange={(event) => onEngineProviderChange(event.target.value)}
            title="Inference engine"
          >
            <option value="ollama">Ollama</option>
            <option value="browser" disabled={!browserSupported}>Browser WebGPU</option>
          </select>
        </div>

        <div className="settings-row">
          <div>
            <h2>Browser model</h2>
            <p>{browserInitializing ? formatProgress(browserProgress) : (browserGpuVendor ? `GPU vendor: ${browserGpuVendor}` : 'Pilih model browser yang lebih kecil dulu untuk Intel Iris.')}</p>
          </div>
          <select
            value={browserModel}
            onChange={(event) => onBrowserModelChange(event.target.value)}
            disabled={!browserModels.length}
            title="Browser model"
          >
            {!browserModels.length && <option value="">Tidak ada model browser</option>}
            {browserModels.map((item) => (
              <option key={item.name} value={item.name}>{item.label || item.name}</option>
            ))}
          </select>
        </div>

        <div className="settings-row settings-row-stack">
          <div>
            <h2>Browser diagnostics</h2>
            <p>{browserRuntimeStats || 'Stat runtime browser akan muncul setelah model berhasil dimuat.'}</p>
          </div>
        </div>

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
