import { useEffect, useRef } from 'react';
import Icon from './Icon.jsx';

export default function TerminalPanel({ entries, onClose, onClear }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  return (
    <aside className="terminal-panel">
      <div className="terminal-head">
        <span className="terminal-title">
          <Icon name="terminal" />
          Terminal
        </span>
        <div className="terminal-actions">
          <button className="icon-button" onClick={onClear} title="Bersihkan terminal" aria-label="Bersihkan terminal" disabled={!entries.length}>
            <Icon name="trash" />
          </button>
          <button className="icon-button" onClick={onClose} title="Tutup terminal" aria-label="Tutup terminal">
            <Icon name="back" />
          </button>
        </div>
      </div>
      <div className="terminal-body">
        {!entries.length && <p className="terminal-empty">Perintah yang dijalankan agent akan muncul di sini.</p>}
        {entries.map((entry) => (
          <div key={entry.id} className={`terminal-entry ${entry.status}`}>
            <div className="terminal-command">
              <span className="terminal-prompt">$</span>
              <span className="terminal-cmd-text">{entry.command}</span>
              <span className="terminal-status">{entry.status === 'running' ? '…' : '✓'}</span>
            </div>
            {entry.output ? <pre className="terminal-output">{entry.output}</pre> : null}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </aside>
  );
}
