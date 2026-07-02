const TOOL_LABELS = {
  read_file: 'Baca file',
  write_file: 'Tulis file',
  edit_file: 'Edit file',
  list_directory: 'Daftar direktori',
  search_text: 'Cari teks',
  run_command: 'Jalankan perintah'
};

function summarizeArgs(name, args = {}) {
  if (name === 'run_command') return args.command || '';
  if (name === 'search_text') return args.pattern || '';
  if (args.path !== undefined) return args.path || '(root)';
  return '';
}

export default function ToolMessage({ name, args, result, status }) {
  const label = TOOL_LABELS[name] || name;
  const target = summarizeArgs(name, args);
  const running = status === 'running';

  return (
    <div className={`tool-card ${running ? 'running' : 'done'}`}>
      <div className="tool-head">
        <span className="tool-badge">{running ? '⏳' : '✓'}</span>
        <span className="tool-name">{label}</span>
        {target ? <code className="tool-target">{target}</code> : null}
      </div>
      {result ? <pre className="tool-result">{result.length > 4000 ? `${result.slice(0, 4000)}\n... [dipotong]` : result}</pre> : null}
    </div>
  );
}
