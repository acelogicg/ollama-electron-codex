import ModelBadges from './ModelBadges.jsx';

const LOCAL_BASE_URL = 'http://127.0.0.1:1234';

export default function SettingsPage({
  memoryEnabled,
  autoCompactContext,
  baseUrl,
  models,
  model,
  tools,
  loadingModels,
  onBaseUrlChange,
  onApplyBaseUrl,
  onRefreshModels,
  onModelChange,
  onMemoryChange,
  onAutoCompactChange
}) {
  const isLocal = baseUrl.trim().replace(/\/+$/, '') === LOCAL_BASE_URL;

  return (
    <section className="settings-page">
      <div className="settings-panel">
        <div className="settings-row settings-row-stack">
          <div>
            <h2>LM Studio server</h2>
            <p>
              Inferensi berjalan penuh di LM Studio. Gunakan server lokal atau isi base URL
              LM Studio lain di jaringan (mis. <code>http://192.168.1.10:1234</code>).
              Pastikan Local Server di LM Studio sudah aktif.
            </p>
          </div>
          <div className="settings-inline">
            <input
              type="text"
              className="settings-input"
              value={baseUrl}
              placeholder={LOCAL_BASE_URL}
              onChange={(event) => onBaseUrlChange(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') onApplyBaseUrl(); }}
              title="LM Studio base URL"
              spellCheck={false}
            />
            <button
              type="button"
              className="settings-button"
              onClick={() => onBaseUrlChange(LOCAL_BASE_URL)}
              disabled={isLocal}
              title="Pakai server lokal"
            >
              Lokal
            </button>
            <button
              type="button"
              className="settings-button"
              onClick={() => onApplyBaseUrl()}
              title="Terapkan & muat ulang model"
            >
              Terapkan
            </button>
          </div>
        </div>

        <div className="settings-row settings-row-stack">
          <div>
            <h2>Model</h2>
            <p>
              {loadingModels
                ? 'Memuat daftar model dari LM Studio...'
                : (models.length
                  ? `${models.length} model terdeteksi. Model tanpa tool calling dinonaktifkan untuk mode Agent.`
                  : `Belum ada model dari ${baseUrl}. Muat model di LM Studio lalu tekan Refresh.`)}
            </p>
          </div>
          <div className="settings-inline">
            <select
              className="settings-input"
              value={model}
              onChange={(event) => onModelChange(event.target.value)}
              disabled={loadingModels || !models.length}
              title="Pilih model"
            >
              {!model && (
                <option value="">
                  {models.length ? 'Tidak ada model Agent yang kompatibel' : 'Tidak ada model'}
                </option>
              )}
              {models.map((item) => (
                <option
                  key={item.name}
                  value={item.name}
                  disabled={!item.capabilities?.tools || item.capabilities?.embedding}
                >
                  {item.loaded && item.capabilities?.tools ? '● ' : '○ '}
                  {item.label || item.name}
                  {!item.capabilities?.tools || item.capabilities?.embedding ? ' — tanpa agent tools' : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="settings-button"
              onClick={() => onRefreshModels()}
              disabled={loadingModels}
              title="Muat ulang daftar model"
            >
              {loadingModels ? 'Memuat...' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="settings-row settings-row-stack">
          <div>
            <h2>Tool agent {tools.length ? `(${tools.length})` : ''}</h2>
            <p>Kemampuan yang bisa dipakai model dalam mode Agent. Semua dibatasi pada direktori workspace yang dipilih.</p>
          </div>
          <ul className="tool-list">
            {tools.length
              ? tools.map((tool) => (
                <li key={tool.name} className="tool-item">
                  <code className="tool-item-name">{tool.name}</code>
                  <span className="tool-item-desc">{tool.description}</span>
                </li>
              ))
              : <li className="tool-item"><span className="tool-item-desc">Tidak ada tool terdeteksi.</span></li>}
          </ul>
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
