import Icon from './Icon.jsx';

export default function Topbar({
  model,
  models,
  selected,
  status,
  mode,
  modes,
  githubRepos,
  selectedRepo,
  loadingRepos,
  loadingModels,
  generating,
  onModelChange,
  onModeChange,
  onRepoChange,
  onReloadRepos,
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
        <div className="mode-switcher" role="group" aria-label="Mode">
          {modes.map((item) => (
            <button
              key={item.id}
              className={`icon-button ${mode === item.id ? 'active' : ''}`}
              onClick={() => onModeChange(item.id)}
              title={item.title}
              aria-label={item.title}
              disabled={generating}
            >
              <Icon name={item.icon} />
            </button>
          ))}
        </div>

        <div className="repo-picker">
          <Icon name="github" />
          <select
            className="repo-select"
            value={selectedRepo?.nameWithOwner || ''}
            onChange={(event) => onRepoChange(event.target.value)}
            disabled={loadingRepos || generating || !githubRepos.length}
            title={selectedRepo?.nameWithOwner || 'GitHub repo'}
          >
            <option value="">No repo</option>
            {githubRepos.map((repo) => (
              <option key={repo.nameWithOwner} value={repo.nameWithOwner}>{repo.nameWithOwner}</option>
            ))}
          </select>
          <button className="icon-button" onClick={onReloadRepos} title="Muat ulang repo" aria-label="Muat ulang repo" disabled={loadingRepos || generating}>
            <Icon name="refresh" />
          </button>
        </div>

        <select value={model} onChange={(event) => onModelChange(event.target.value)} disabled={loadingModels || generating} title={selected?.name || 'Pilih model'}>
          {!models.length && <option value="">Tidak ada model</option>}
          {models.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
        </select>
        <button className="icon-button" onClick={onReloadModels} title="Muat ulang model" aria-label="Muat ulang model">
          <Icon name="refresh" />
        </button>
        <button className="icon-button" onClick={onNewChat} title="Percakapan baru" aria-label="Percakapan baru">
          <Icon name="plus" />
        </button>
      </div>
    </header>
  );
}
