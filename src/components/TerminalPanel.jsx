import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

const STATUS_LABELS = {
  running: '...',
  done: 'OK',
  error: 'ERR',
  cancelled: 'STOP'
};

export default function TerminalPanel({ entries, cwd, onRun, onCancel, onClose, onClear }) {
  const bottomRef = useRef(null);
  const bodyRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const inputRef = useRef(null);
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useEffect(() => {
    if (!stickToBottomRef.current || !bodyRef.current) return undefined;
    const frame = requestAnimationFrame(() => {
      if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [entries]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = (event) => {
    event.preventDefault();
    const value = command.trim();
    if (!value) return;
    onRun(value);
    setHistory((current) => [...current.filter((item) => item !== value), value]);
    setHistoryIndex(-1);
    setCommand('');
  };

  const navigateHistory = (event) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    if (!history.length) return;
    const nextIndex = event.key === 'ArrowUp'
      ? Math.min(historyIndex + 1, history.length - 1)
      : Math.max(historyIndex - 1, -1);
    setHistoryIndex(nextIndex);
    setCommand(nextIndex < 0 ? '' : history[history.length - 1 - nextIndex]);
  };

  const hasCompletedEntries = entries.some((entry) => entry.status !== 'running');
  const cwdLabel = cwd || 'workspace';
  const handleScroll = (event) => {
    const element = event.currentTarget;
    stickToBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
  };

  return (
    <aside className="terminal-panel">
      <div className="terminal-head">
        <span className="terminal-title">
          <Icon name="terminal" />
          Terminal
        </span>
        <div className="terminal-actions">
          <button
            className="icon-button"
            onClick={onClear}
            title="Bersihkan output selesai"
            aria-label="Bersihkan output selesai"
            disabled={!hasCompletedEntries}
          >
            <Icon name="trash" />
          </button>
          <button className="icon-button" onClick={onClose} title="Tutup terminal" aria-label="Tutup terminal">
            <Icon name="back" />
          </button>
        </div>
      </div>
      <div className="terminal-cwd" title={cwdLabel}>{cwdLabel}</div>
      <div className="terminal-body" ref={bodyRef} onScroll={handleScroll}>
        {!entries.length && <p className="terminal-empty">Jalankan command di bawah atau tunggu command dari agent.</p>}
        {entries.map((entry) => (
          <div key={entry.id} className={`terminal-entry ${entry.status}`}>
            <div className="terminal-command">
              <span className="terminal-prompt">&gt;</span>
              <span className="terminal-cmd-text">{entry.command}</span>
              {entry.status === 'running' ? (
                <button
                  type="button"
                  className="terminal-stop"
                  onClick={() => onCancel(entry)}
                  title="Hentikan command"
                >
                  <Icon name="cancel" />
                  <span>Stop</span>
                </button>
              ) : (
                <span className="terminal-status">{STATUS_LABELS[entry.status] || entry.status}</span>
              )}
            </div>
            {entry.output ? (
              <pre className={`terminal-output ${entry.hasStderr ? 'has-stderr' : ''}`}>{entry.output}</pre>
            ) : null}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form className="terminal-input-row" onSubmit={submit}>
        <span className="terminal-prompt">&gt;</span>
        <input
          ref={inputRef}
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          onKeyDown={navigateHistory}
          placeholder="Ketik command lalu Enter"
          aria-label="Command terminal"
          spellCheck={false}
          autoComplete="off"
        />
        <button type="submit" disabled={!command.trim()} title="Jalankan command">Run</button>
      </form>
    </aside>
  );
}
