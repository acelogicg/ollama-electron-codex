import Icon from './Icon.jsx';
import ModelBadges from './ModelBadges.jsx';

export default function Topbar({
  model,
  models,
  selected,
  status,
  agentReadiness,
  view,
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
  onChooseWorkspace,
  onReloadRepos,
  onReloadModels,
  onNewChat,
  onOpenSettings,
  onBackToChat,
  terminalOpen,
  onToggleTerminal
}) {
  const showingSettings = view === 'settings';
  const readinessLabel = agentReadiness.ready
    ? 'Agent siap dari workstation ini'
    : (agentReadiness.reasons.join('. ') || 'Agent belum siap');

  return (
    <header className="topbar">
      <div className="title-group">
        <span className="app-mark" title="LM Studio">
          <Icon name="app" />
        </span>
        <span className={`status-dot ${model ? 'online' : ''}`} title={status} />
        <span className="engine-label">LM Studio</span>
        <span
          className={`agent-readiness ${agentReadiness.ready ? 'ready' : (agentReadiness.checking ? 'checking' : 'not-ready')}`}
          title={readinessLabel}
          aria-label={readinessLabel}
        >
          <Icon name="agent" />
          <span className="agent-readiness-dot" />
        </span>
      </div>

      <div className="toolbar">
        {!showingSettings && modes.length > 1 && (
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
        )}

        {!showingSettings && <div className="repo-picker">
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
          <button className="icon-button" onClick={onChooseWorkspace} title="Pilih direktori repo" aria-label="Pilih direktori repo" disabled={loadingRepos || generating}>
            <Icon name="folder" />
          </button>
          <button className="icon-button" onClick={onReloadRepos} title="Muat ulang repo" aria-label="Muat ulang repo" disabled={loadingRepos || generating}>
            <Icon name="refresh" />
          </button>
        </div>}

        {!showingSettings && <select value={model} onChange={(event) => onModelChange(event.target.value)} disabled={loadingModels || generating} title={selected?.label || selected?.name || 'Pilih model'}>
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
        </select>}
        {!showingSettings && <ModelBadges capabilities={selected?.capabilities} />}
        {!showingSettings && <button className="icon-button" onClick={onReloadModels} title="Muat ulang model" aria-label="Muat ulang model">
          <Icon name="refresh" />
        </button>}
        {!showingSettings && <button className="icon-button" onClick={onNewChat} title="Percakapan baru" aria-label="Percakapan baru">
          <Icon name="plus" />
        </button>}
        <button
          className={`icon-button ${showingSettings ? 'active' : ''}`}
          onClick={showingSettings ? onBackToChat : onOpenSettings}
          title={showingSettings ? 'Kembali ke chat' : 'Settings'}
          aria-label={showingSettings ? 'Kembali ke chat' : 'Settings'}
        >
          <Icon name={showingSettings ? 'back' : 'settings'} />
        </button>
        <button
          className={`icon-button ${terminalOpen ? 'active' : ''}`}
          onClick={onToggleTerminal}
          title={terminalOpen ? 'Sembunyikan terminal' : 'Tampilkan terminal'}
          aria-label={terminalOpen ? 'Sembunyikan terminal' : 'Tampilkan terminal'}
        >
          <Icon name="terminal" />
        </button>
      </div>
    </header>
  );
}
