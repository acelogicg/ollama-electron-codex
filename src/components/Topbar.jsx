import Icon from './Icon.jsx';

export default function Topbar({
  model,
  models,
  selected,
  status,
  loadingModels,
  generating,
  onModelChange,
  onReloadModels,
  onNewChat
}) {
  return (
    <header className="topbar">
      <div className="title-group">
        <span className="app-mark" title="Ollama">
          <Icon name="app" />
        </span>
        <span className={`status-dot ${model ? 'online' : ''}`} title={status} />
      </div>

      <div className="toolbar">
        <select value={model} onChange={(event) => onModelChange(event.target.value)} disabled={loadingModels || generating} title={selected?.name || 'Pilih model'}>
          {!models.length && <option value="">Tidak ada model</option>}
          {models.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
        </select>
        <button className="icon-button" onClick={onReloadModels} title="Muat ulang model" aria-label="Muat ulang model">
          <Icon name="refresh" />
        </button>
        <button className="icon-button" onClick={onNewChat} disabled={generating} title="Percakapan baru" aria-label="Percakapan baru">
          <Icon name="plus" />
        </button>
      </div>
    </header>
  );
}
