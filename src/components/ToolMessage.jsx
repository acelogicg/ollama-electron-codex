import { useState } from 'react';

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
  const [expanded, setExpanded] = useState(false);
  const label = TOOL_LABELS[name] || name;
  const target = summarizeArgs(name, args);
  const running = status === 'running';
  const hasResult = Boolean(result);
  const canToggle = hasResult;

  return (
    <div className={`tool-card ${running ? 'running' : 'done'}`}>
      <button
        type="button"
        className="tool-head"
        onClick={() => canToggle && setExpanded((open) => !open)}
        disabled={!canToggle}
        aria-expanded={expanded}
        title={canToggle ? (expanded ? 'Sembunyikan detail' : 'Tampilkan detail') : undefined}
      >
        <span className="tool-badge">{running ? '⏳' : '✓'}</span>
        <span className="tool-name">{label}</span>
        {target ? <code className="tool-target">{target}</code> : null}
        {canToggle ? <span className={`tool-caret ${expanded ? 'open' : ''}`}>▸</span> : null}
      </button>
      {hasResult && expanded
        ? <pre className="tool-result">{result.length > 4000 ? `${result.slice(0, 4000)}\n... [dipotong]` : result}</pre>
        : null}
    </div>
  );
}
