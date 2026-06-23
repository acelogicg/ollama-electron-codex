import { useEffect, useMemo, useRef, useState } from 'react';
import WebGLBackground from './WebGLBackground.jsx';

const initialMessage = { role: 'assistant', content: 'Ollama siap. Pilih model lalu mulai percakapan.' };

export default function App() {
  const [models, setModels] = useState([]);
  const [model, setModel] = useState(localStorage.getItem('ollama-model') || '');
  const [messages, setMessages] = useState([initialMessage]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('Menghubungkan…');
  const [loadingModels, setLoadingModels] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [requestId, setRequestId] = useState(null);
  const bottomRef = useRef(null);

  const selected = useMemo(() => models.find((item) => item.name === model), [models, model]);

  const loadModels = async () => {
    setLoadingModels(true);
    setStatus('Memuat model…');
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
    setStatus('Memuat…');
    window.ollama.preloadModel(model)
      .then(() => setStatus('Siap'))
      .catch((error) => setStatus(`Gagal: ${error.message}`));
  }, [model]);

  useEffect(() => {
    const offChunk = window.ollama.onChunk(({ requestId: id, data }) => {
      if (id !== requestId) return;
      const text = data.message?.content || '';
      if (!text) return;
      setMessages((current) => {
        const next = [...current];
        const last = next[next.length - 1];
        if (last?.role === 'assistant' && last.streaming) {
          next[next.length - 1] = { ...last, content: last.content + text };
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
    const history = [...messages.filter((m) => m !== initialMessage && !m.streaming), userMessage]
      .map(({ role, content: text }) => ({ role, content: text }));

    setInput('');
    setGenerating(true);
    setRequestId(id);
    setStatus('Menjawab…');
    setMessages((current) => [...current, userMessage, { role: 'assistant', content: '', streaming: true }]);

    await window.ollama.chat({ requestId: id, model, messages: history, options: { temperature: 0.7 } });
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
            <strong>Ollama</strong>
            <span className={`status-dot ${model ? 'online' : ''}`} />
            <span className="status-text">{status}</span>
          </div>

          <div className="toolbar">
            <select value={model} onChange={(e) => setModel(e.target.value)} disabled={loadingModels || generating} title={selected?.name || 'Pilih model'}>
              {!models.length && <option value="">Tidak ada model</option>}
              {models.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
            </select>
            <button className="icon-button" onClick={loadModels} title="Muat ulang model">↻</button>
            <button className="icon-button" onClick={() => setMessages([initialMessage])} disabled={generating} title="Percakapan baru">＋</button>
          </div>
        </header>

        <section className="messages">
          {messages.map((message, index) => (
            <article key={index} className={`message-row ${message.role}`}>
              <div className="bubble">
                <div className="content">
                  {message.content || (message.streaming ? <span className="typing"><b /><b /><b /></span> : '')}
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
              placeholder={model ? 'Tulis pesan…' : 'Model belum tersedia'}
              disabled={!model}
              rows={1}
            />
            {generating
              ? <button className="send stop" onClick={stop} title="Hentikan">■</button>
              : <button className="send" onClick={send} disabled={!input.trim() || !model} title="Kirim">↑</button>}
          </div>
        </footer>
      </main>
    </div>
  );
}
