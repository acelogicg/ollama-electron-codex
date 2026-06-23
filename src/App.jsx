import { useEffect, useMemo, useRef, useState } from 'react';
import Composer from './components/Composer.jsx';
import MessageList from './components/MessageList.jsx';
import Topbar from './components/Topbar.jsx';
import WebGLBackground from './WebGLBackground.jsx';

const initialMessages = [];

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
      setMessages((current) => current.map((message) => (
        message.streaming ? { ...message, streaming: false } : message
      )));
      setGenerating(false);
      setRequestId(null);
      setStatus('Siap');
    });

    const offError = window.ollama.onError(({ requestId: id, message }) => {
      if (id !== requestId) return;
      setMessages((current) => current.map((item) => (
        item.streaming ? { ...item, streaming: false, content: `Error: ${message}` } : item
      )));
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
    const history = [...messages.filter((message) => !message.streaming), userMessage]
      .map(({ role, content: text }) => ({ role, content: text }));

    setInput('');
    setGenerating(true);
    setRequestId(id);
    setStatus('Menjawab...');
    setMessages((current) => [...current, userMessage, { role: 'assistant', content: '', streaming: true }]);

    await window.ollama.chat({ requestId: id, model, messages: history, think: 'auto', options: { temperature: 0.7 } });
  };

  const stop = async () => {
    if (!requestId) return;
    await window.ollama.cancel(requestId);
    setMessages((current) => current.map((message) => (
      message.streaming ? { ...message, streaming: false } : message
    )));
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
        <Topbar
          model={model}
          models={models}
          selected={selected}
          status={status}
          loadingModels={loadingModels}
          generating={generating}
          onModelChange={setModel}
          onReloadModels={loadModels}
          onNewChat={() => setMessages(initialMessages)}
        />
        <MessageList messages={messages} bottomRef={bottomRef} />
        <Composer
          input={input}
          model={model}
          generating={generating}
          onInputChange={setInput}
          onKeyDown={onKeyDown}
          onSend={send}
          onStop={stop}
        />
      </main>
    </div>
  );
}
