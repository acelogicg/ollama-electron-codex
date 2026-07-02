import Icon from './Icon.jsx';

export default function Composer({
  input,
  model,
  generating,
  onInputChange,
  onKeyDown,
  onSend,
  onStop
}) {
  return (
    <footer className="composer-wrap">
      <div className="composer">
        <textarea
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={model ? 'Tulis pesan...' : 'Model belum tersedia'}
          disabled={!model}
          rows={1}
        />
        {generating
          ? (
            <button type="button" className="send stop" onClick={onStop} title="Hentikan proses" aria-label="Hentikan proses">
              <Icon name="cancel" />
            </button>
          )
          : (
            <button className="send" onClick={onSend} disabled={!input.trim() || !model} title="Kirim" aria-label="Kirim">
              <Icon name="send" />
            </button>
          )}
      </div>
    </footer>
  );
}
