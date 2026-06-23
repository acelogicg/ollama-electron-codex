import { useEffect, useMemo, useRef, useState } from 'react';
import WebGLBackground from './WebGLBackground.jsx';

const initialMessages = [];
const codeBlockPattern = /```([a-zA-Z0-9_+.-]*)\n?([\s\S]*?)```/g;
const tokenPattern = /(\/\/.*|#.*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:async|await|break|case|catch|class|const|continue|def|else|export|extends|finally|for|from|function|if|import|in|let|new|null|return|throw|try|var|while|true|false)\b|\b\d+(?:\.\d+)?\b)/g;

function Icon({ name }) {
  const paths = {
    app: (
      <>
        <path d="M12 3.5 19.5 8v8L12 20.5 4.5 16V8L12 3.5Z" />
        <path d="M8.5 10.25h7" />
        <path d="M8.5 13.75h4.25" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 11a8 8 0 0 0-14.25-5" />
        <path d="M5 3v4h4" />
        <path d="M4 13a8 8 0 0 0 14.25 5" />
        <path d="M19 21v-4h-4" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>
    ),
    send: (
      <>
        <path d="M12 19V5" />
        <path d="m6 11 6-6 6 6" />
      </>
    ),
    stop: <path d="M7 7h10v10H7z" />,
    thinking: (
      <>
        <path d="M9.5 8.5a2.5 2.5 0 0 1 5 0c0 1.25-.72 1.83-1.43 2.42-.58.48-1.07.89-1.07 1.83" />
        <path d="M12 16h.01" />
        <path d="M5.5 12.5a6.5 6.5 0 1 1 13 0" />
        <path d="M7 17.5h10" />
      </>
    )
  };

  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function highlightCode(code) {
  return code.split(tokenPattern).filter(Boolean).map((part, index) => {
    let className = 'code-token';

    if (/^(\/\/|#|\/\*)/.test(part)) className += ' comment';
    else if (/^["'`]/.test(part)) className += ' string';
    else if (/^\d/.test(part)) className += ' number';
    else if (/^(true|false|null)$/.test(part)) className += ' literal';
    else if (/^[a-zA-Z_]/.test(part)) className += ' keyword';

    return <span key={index} className={className}>{part}</span>;
  });
}

function MessageContent({ content, streaming, thinkingActive }) {
  if (!content && thinkingActive) {
    return (
      <span className="thinking-state" title="Thinking" aria-label="Thinking">
        <Icon name="thinking" />
        <span className="typing"><b /><b /><b /></span>
      </span>
    );
  }

  if (!content) return streaming ? <span className="typing"><b /><b /><b /></span> : '';

  const blocks = [];
  let cursor = 0;

  for (const match of content.matchAll(codeBlockPattern)) {
    if (match.index > cursor) {
      blocks.push({ type: 'text', value: content.slice(cursor, match.index) });
    }

    blocks.push({
      type: 'code',
      language: match[1] || 'auto',
      value: match[2].replace(/\n$/, '')
    });
    cursor = match.index + match[0].length;
  }

  if (cursor < content.length) blocks.push({ type: 'text', value: content.slice(cursor) });

  return blocks.map((block, index) => {
    if (block.type === 'code') {
      return (
        <figure key={index} className="code-block">
          <figcaption>{block.language}</figcaption>
          <pre><code>{highlightCode(block.value)}</code></pre>
        </figure>
      );
    }

    return <span key={index} className="text-fragment">{block.value}</span>;
  });
}

export default function App() {
  const [models, setModels] = useState([]);
  const [model, setModel] = useState(localStorage.getItem('ollama-model') || '');
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('Menghubungkan...');
  const [loadingModels, setLoadingModels] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [requestId, setRequestId] = useState(null);
  const bottomRef = useRef(null);

  const selected = useMemo(() => models.find((item) => item.name === model), [models, model]);
  const thinkMode = useMemo(() => {
    const normalized = model.toLowerCase();
    return normalized.includes('gpt-oss') ? 'medium' : true;
  }, [model]);

  const loadModels = async () => {
    setLoadingModels(true);
    setStatus('Memuat model...');
    try {
      const list = await window.ollama.listModels();
      setModels(list);
      const preferred = list.some((item) => item.name === model) ? model : list[0]?.name || '';
      setModel(preferred);
      setStatus(list.length ? 'Siap' : 'Model tidak ditemukan');
    } catch (error) {
      setStatus(`Offline: ${error.message}`);
    } finally {
      setLoadingModels(false);
    }
  };

  useEffect(() => { loadModels(); }, []);

  useEffect(() => {
    if (!model) return;
    localStorage.setItem('ollama-model', model);
    setStatus('Memuat...');
    window.ollama.preloadModel(model)
      .then(() => setStatus('Siap'))
      .catch((error) => setStatus(`Gagal: ${error.message}`));
  }, [model]);

  useEffect(() => {
    const offChunk = window.ollama.onChunk(({ requestId: id, data }) => {
      if (id !== requestId) return;
      const text = data.message?.content || '';
      const thinking = data.message?.thinking || '';
      if (!text && !thinking) return;
      setMessages((current) => {
        const next = [...current];
        const last = next[next.length - 1];
        if (last?.role === 'assistant' && last.streaming) {
          next[next.length - 1] = {
            ...last,
            content: last.content + text,
            thinking: (last.thinking || '') + thinking,
            thinkingActive: Boolean(thinking && !text)
          };
        }
        return next;
      });
    });

    const offDone = window.ollama.onDone(({ requestId: id }) => {
      if (id !== requestId) return;
      setMessages((current) => current.map((m) => m.streaming ? { ...m, streaming: false } : m));
      setGenerating(false);
      setRequestId(null);
      setStatus('Siap');
    });

    const offError = window.ollama.onError(({ requestId: id, message }) => {
      if (id !== requestId) return;
      setMessages((current) => current.map((m) => m.streaming ? { ...m, streaming: false, content: `Error: ${message}` } : m));
      setGenerating(false);
      setRequestId(null);
      setStatus('Error');
    });

    return () => { offChunk(); offDone(); offError(); };
  }, [requestId]);

  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages]);

  const send = async () => {
    const content = input.trim();
    if (!content || !model || generating) return;

    const id = crypto.randomUUID();
    const userMessage = { role: 'user', content };
    const history = [...messages.filter((m) => !m.streaming), userMessage]
      .map(({ role, content: text }) => ({ role, content: text }));

    setInput('');
    setGenerating(true);
    setRequestId(id);
    setStatus('Menjawab...');
    setMessages((current) => [...current, userMessage, { role: 'assistant', content: '', streaming: true }]);

    await window.ollama.chat({ requestId: id, model, messages: history, think: thinkMode, options: { temperature: 0.7 } });
  };

  const stop = async () => {
    if (!requestId) return;
    await window.ollama.cancel(requestId);
    setMessages((current) => current.map((m) => m.streaming ? { ...m, streaming: false } : m));
    setGenerating(false);
    setRequestId(null);
    setStatus('Dihentikan');
  };

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  return (
    <div className="app-shell">
      <WebGLBackground />
      <main className="chat-panel">
        <header className="topbar">
          <div className="title-group">
            <span className="app-mark" title="Ollama">
              <Icon name="app" />
            </span>
            <span className={`status-dot ${model ? 'online' : ''}`} title={status} />
          </div>

          <div className="toolbar">
            <select value={model} onChange={(e) => setModel(e.target.value)} disabled={loadingModels || generating} title={selected?.name || 'Pilih model'}>
              {!models.length && <option value="">Tidak ada model</option>}
              {models.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
            </select>
            <button className="icon-button" onClick={loadModels} title="Muat ulang model" aria-label="Muat ulang model">
              <Icon name="refresh" />
            </button>
            <button className="icon-button" onClick={() => setMessages(initialMessages)} disabled={generating} title="Percakapan baru" aria-label="Percakapan baru">
              <Icon name="plus" />
            </button>
          </div>
        </header>

        <section className="messages">
          {messages.map((message, index) => (
            <article key={index} className={`message-row ${message.role} ${message.thinkingActive ? 'thinking' : ''}`}>
              <div className="bubble">
                <div className="content">
                  <MessageContent content={message.content} streaming={message.streaming} thinkingActive={message.thinkingActive} />
                </div>
              </div>
            </article>
          ))}
          <div ref={bottomRef} />
        </section>

        <footer className="composer-wrap">
          <div className="composer">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={model ? 'Tulis pesan...' : 'Model belum tersedia'}
              disabled={!model}
              rows={1}
            />
            {generating
              ? (
                <button className="send stop" onClick={stop} title="Hentikan" aria-label="Hentikan">
                  <Icon name="stop" />
                </button>
              )
              : (
                <button className="send" onClick={send} disabled={!input.trim() || !model} title="Kirim" aria-label="Kirim">
                  <Icon name="send" />
                </button>
              )}
          </div>
        </footer>
      </main>
    </div>
  );
}
