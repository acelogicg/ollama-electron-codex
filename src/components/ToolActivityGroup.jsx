import Icon from './Icon.jsx';

const LABELS = {
  read_file: 'Baca file',
  list_directory: 'Daftar direktori',
  search_text: 'Cari teks'
};

function targetFor(item) {
  if (item.name === 'search_text') return item.args?.pattern || '';
  return item.args?.path || '(root)';
}

export default function ToolActivityGroup({ items }) {
  const running = items.some((item) => item.status === 'running');
  const failed = items.some((item) => item.status === 'error');
  const completed = items.filter((item) => item.status !== 'running').length;

  return (
    <details className={`tool-activity-group ${running ? 'running' : (failed ? 'error' : 'done')}`} open={running}>
      <summary>
        <Icon name="folder" />
        <span className="tool-group-title">Overview</span>
        <span className="tool-group-count">
          Membaca {completed}/{items.length} sumber
        </span>
        <span className="tool-group-state">{running ? 'Memproses' : (failed ? 'Gagal' : 'Selesai')}</span>
      </summary>
      <div className="tool-group-items">
        {items.map((item) => {
          const target = targetFor(item);
          return (
            <details key={item.toolId} className="tool-group-item">
              <summary>
                <span className={`tool-group-status ${item.status}`} />
                <span>{LABELS[item.name] || item.name}</span>
                {target ? <code>{target}</code> : null}
              </summary>
              {item.result ? (
                <pre>{item.result.length > 3000 ? `${item.result.slice(0, 3000)}\n... [dipotong]` : item.result}</pre>
              ) : null}
            </details>
          );
        })}
      </div>
    </details>
  );
}
