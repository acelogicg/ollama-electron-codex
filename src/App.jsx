import { useEffect, useMemo, useRef, useState } from 'react';
import Composer from './components/Composer.jsx';
import MessageList from './components/MessageList.jsx';
import SettingsPage from './components/SettingsPage.jsx';
import Topbar from './components/Topbar.jsx';
import { buildChatHistory, buildSystemContext, chatModes } from './utils/chatContext.js';
import WebGLBackground from './WebGLBackground.jsx';

const initialMessages = [];

function updateStreamingMessage(setMessages, updater) {
  setMessages((current) => {
    const next = [...current];
    const last = next[next.length - 1];
    if (last?.role === 'assistant' && last.streaming) {
      next[next.length - 1] = updater(last);
    }
    return next;
  });
}

export default function App() {
  const [models, setModels] = useState([]);
  const [model, setModel] = useState(localStorage.getItem('ollama-model') || '');
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('Menghubungkan...');
  const [view, setView] = useState('chat');
  const [mode, setMode] = useState(localStorage.getItem('chat-mode') || 'ask');
  const [memoryEnabled, setMemoryEnabled] = useState(localStorage.getItem('memory-enabled') !== 'false');
  const [autoCompactContext, setAutoCompactContext] = useState(localStorage.getItem('auto-compact-context') !== 'false');
  const [githubRepos, setGithubRepos] = useState([]);
  const [githubRepoName, setGithubRepoName] = useState(localStorage.getItem('github-repo') || '');
  const [workspaceDir, setWorkspaceDir] = useState(localStorage.getItem('workspace-dir') || '');
  const [workspaceRepo, setWorkspaceRepo] = useState(null);
  const [workspaceContext, setWorkspaceContext] = useState(null);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [requestId, setRequestId] = useState(null);
  const [engineProvider, setEngineProvider] = useState(localStorage.getItem('engine-provider') || 'ollama');
  const [browserModels, setBrowserModels] = useState([]);
  const [browserModel, setBrowserModel] = useState(localStorage.getItem('browser-model') || '');
  const [browserSupported, setBrowserSupported] = useState(false);
  const [browserInitializing, setBrowserInitializing] = useState(false);
  const [browserProgress, setBrowserProgress] = useState(null);
  const [browserGpuVendor, setBrowserGpuVendor] = useState('');
  const [browserRuntimeStats, setBrowserRuntimeStats] = useState('');
  const bottomRef = useRef(null);
  const browserWorkerRef = useRef(null);
  const browserEngineRef = useRef(null);
  const browserLoadedModelRef = useRef('');
  const browserAbortRef = useRef(false);

  const selected = useMemo(() => models.find((item) => item.name === model), [models, model]);
  const selectedRepo = useMemo(() => (
    githubRepos.find((repo) => repo.nameWithOwner === githubRepoName) || null
  ), [githubRepos, githubRepoName]);

  const activeModels = engineProvider === 'browser' ? browserModels : models;
  const activeModelValue = engineProvider === 'browser' ? browserModel : model;
  const activeSelectedModel = useMemo(() => (
    activeModels.find((item) => item.name === activeModelValue) || null
  ), [activeModels, activeModelValue]);
  const canUseBrowserProvider = browserSupported && browserModels.length > 0;
  const activeModelReady = engineProvider === 'browser'
    ? Boolean(browserModel && canUseBrowserProvider)
    : Boolean(model);

  const loadModels = async () => {
    setLoadingModels(true);
    setStatus('Memuat model Ollama...');
    try {
      const list = await window.ollama.listModels();
      setModels(list);
      const preferred = list.some((item) => item.name === model) ? model : list[0]?.name || '';
      setModel(preferred);
      setStatus(list.length ? 'Siap' : 'Model Ollama tidak ditemukan');
    } catch (error) {
      setStatus(`Ollama offline: ${error.message}`);
    } finally {
      setLoadingModels(false);
    }
  };

  const loadGitHubRepos = async (targetDir = workspaceDir) => {
    setLoadingRepos(true);
    try {
      const [repos, workspace, context] = await Promise.all([
        window.github.listRepos(targetDir),
        window.github.getWorkspaceRepo(targetDir),
        window.workspace.getContext(targetDir)
      ]);
      setGithubRepos(repos);
      setWorkspaceRepo(workspace);
      setWorkspaceContext(context);
      if (workspace?.root) setWorkspaceDir(workspace.root);
      setGithubRepoName((current) => {
        if (!repos.length) return '';
        if (workspace?.nameWithOwner && repos.some((repo) => repo.nameWithOwner === workspace.nameWithOwner)) {
          return workspace.nameWithOwner;
        }
        return repos.some((repo) => repo.nameWithOwner === current) ? current : repos[0].nameWithOwner;
      });
    } catch (_error) {
      setGithubRepos([]);
      setGithubRepoName('');
      setWorkspaceRepo(null);
      setWorkspaceContext(null);
    } finally {
      setLoadingRepos(false);
    }
  };

  const ensureBrowserEngine = () => {
    const engine = browserEngineRef.current;
    if (!engine) throw new Error('Engine browser belum siap.');
    if (!browserSupported) throw new Error('WebGPU tidak tersedia di renderer Electron ini.');
    return engine;
  };

  const loadBrowserDiagnostics = async (engine, selectedModel = browserModel) => {
    const [vendor, stats] = await Promise.all([
      engine.getGPUVendor().catch(() => ''),
      engine.runtimeStatsText(selectedModel).catch(() => '')
    ]);
    setBrowserGpuVendor(vendor || '');
    setBrowserRuntimeStats(stats || '');
  };

  const ensureBrowserModelLoaded = async (forceReload = false) => {
    const engine = ensureBrowserEngine();
    if (!browserModel) throw new Error('Model browser belum dipilih.');
    if (!forceReload && browserLoadedModelRef.current === browserModel) return engine;

    setBrowserInitializing(true);
    setBrowserProgress({ progress: 0, text: `Menyiapkan ${browserModel}`, timeElapsed: 0 });
    setStatus(`Memuat model browser: ${browserModel}`);

    try {
      await engine.reload(browserModel);
      browserLoadedModelRef.current = browserModel;
      await loadBrowserDiagnostics(engine, browserModel);
      setStatus('Siap');
      return engine;
    } finally {
      setBrowserInitializing(false);
    }
  };

  const reloadActiveModels = async () => {
    if (engineProvider === 'browser') {
      try {
        await ensureBrowserModelLoaded(true);
      } catch (error) {
        setStatus(`Browser error: ${error.message}`);
      }
      return;
    }

    await loadModels();
  };

  useEffect(() => { loadModels(); }, []);
  useEffect(() => { loadGitHubRepos(); }, []);

  useEffect(() => {
    const supported = typeof navigator !== 'undefined' && 'gpu' in navigator;
    setBrowserSupported(supported);

    if (!supported || typeof Worker === 'undefined') {
      if (localStorage.getItem('engine-provider') === 'browser') setEngineProvider('ollama');
      return undefined;
    }

    let cancelled = false;

    import('./browserProvider.js')
      .then(({ createBrowserEngine, browserModelOptions, defaultBrowserModel }) => {
        if (cancelled) return;

        setBrowserModels(browserModelOptions);
        setBrowserModel((current) => current || defaultBrowserModel);

        const { worker, engine } = createBrowserEngine((report) => setBrowserProgress(report));
        browserWorkerRef.current = worker;
        browserEngineRef.current = engine;
      })
      .catch(() => {
        setBrowserSupported(false);
        if (localStorage.getItem('engine-provider') === 'browser') setEngineProvider('ollama');
      });

    return () => {
      cancelled = true;
      const activeEngine = browserEngineRef.current;
      const activeWorker = browserWorkerRef.current;
      browserEngineRef.current = null;
      browserLoadedModelRef.current = '';
      browserWorkerRef.current = null;
      Promise.resolve(activeEngine?.unload?.()).catch(() => {});
      activeWorker?.terminate();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('chat-mode', mode);
  }, [mode]);

  useEffect(() => {
    localStorage.setItem('memory-enabled', String(memoryEnabled));
  }, [memoryEnabled]);

  useEffect(() => {
    localStorage.setItem('auto-compact-context', String(autoCompactContext));
  }, [autoCompactContext]);

  useEffect(() => {
    if (githubRepoName) localStorage.setItem('github-repo', githubRepoName);
    else localStorage.removeItem('github-repo');
  }, [githubRepoName]);

  useEffect(() => {
    if (workspaceDir) localStorage.setItem('workspace-dir', workspaceDir);
    else localStorage.removeItem('workspace-dir');
  }, [workspaceDir]);

  useEffect(() => {
    localStorage.setItem('engine-provider', engineProvider);
  }, [engineProvider]);

  useEffect(() => {
    if (browserModel) localStorage.setItem('browser-model', browserModel);
  }, [browserModel]);

  useEffect(() => {
    if (engineProvider === 'browser' && !canUseBrowserProvider) {
      setStatus('WebGPU browser inference tidak tersedia di perangkat ini.');
    }
  }, [engineProvider, canUseBrowserProvider]);

  useEffect(() => {
    if (engineProvider !== 'ollama' || !model) return;
    localStorage.setItem('ollama-model', model);
    setStatus('Memuat model Ollama...');
    window.ollama.preloadModel(model)
      .then(() => setStatus('Siap'))
      .catch((error) => setStatus(`Gagal: ${error.message}`));
  }, [engineProvider, model]);

  useEffect(() => {
    const offChunk = window.ollama.onChunk(({ requestId: id, data }) => {
      if (id !== requestId) return;
      const text = data.message?.content || '';
      const thinking = data.message?.thinking || '';
      if (!text && !thinking) return;

      updateStreamingMessage(setMessages, (last) => ({
        ...last,
        content: last.content + text,
        thinking: (last.thinking || '') + thinking,
        thinkingActive: Boolean(thinking && !text)
      }));
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

  const sendViaBrowser = async (history) => {
    const engine = await ensureBrowserModelLoaded();
    const chunks = await engine.chat.completions.create({
      model: browserModel,
      messages: history,
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.7
    });

    let finishReason = null;

    for await (const chunk of chunks) {
      const choice = chunk.choices[0];
      const text = choice?.delta?.content || '';
      if (choice?.finish_reason) finishReason = choice.finish_reason;

      if (text) {
        updateStreamingMessage(setMessages, (last) => ({
          ...last,
          content: last.content + text
        }));
      }
    }

    await loadBrowserDiagnostics(engine, browserModel);
    return finishReason;
  };

  const send = async () => {
    const content = input.trim();
    if (!content || !activeModelReady || generating) return;

    const id = crypto.randomUUID();
    const userMessage = { role: 'user', content };
    const chatHistory = buildChatHistory(messages, userMessage, { memoryEnabled, autoCompactContext });
    const history = [buildSystemContext(mode, selectedRepo, workspaceRepo, workspaceContext), ...chatHistory];

    setInput('');
    setGenerating(true);
    setStatus(engineProvider === 'browser' ? 'Menjawab via WebGPU...' : 'Menjawab...');
    setMessages((current) => [...current, userMessage, { role: 'assistant', content: '', streaming: true }]);

    if (engineProvider === 'browser') {
      browserAbortRef.current = false;
      try {
        const finishReason = await sendViaBrowser(history);
        const aborted = browserAbortRef.current || finishReason === 'abort';
        setMessages((current) => current.map((message) => (
          message.streaming ? { ...message, streaming: false } : message
        )));
        setStatus(aborted ? 'Dihentikan' : 'Siap');
      } catch (error) {
        setMessages((current) => current.map((item) => (
          item.streaming ? { ...item, streaming: false, content: `Error: ${error.message}` } : item
        )));
        setStatus(`Browser error: ${error.message}`);
      } finally {
        setGenerating(false);
      }
      return;
    }

    setRequestId(id);
    await window.ollama.chat({ requestId: id, model, messages: history, think: 'auto', options: { temperature: 0.7 } });
  };

  const cancelActiveRequest = async () => {
    if (engineProvider === 'browser') {
      const engine = browserEngineRef.current;
      if (!engine || !generating) return false;
      browserAbortRef.current = true;
      engine.interruptGenerate();
      setStatus('Menghentikan WebGPU...');
      return true;
    }

    if (!requestId) return false;
    await window.ollama.cancel(requestId);
    setMessages((current) => current.map((message) => (
      message.streaming ? { ...message, streaming: false } : message
    )));
    setGenerating(false);
    setRequestId(null);
    setStatus('Dihentikan');
    return true;
  };

  const stop = async () => {
    await cancelActiveRequest();
  };

  const startNewChat = async () => {
    await cancelActiveRequest();
    setMessages(initialMessages);
    setInput('');
    setStatus(activeModelReady ? 'Siap' : status);
  };

  const chooseWorkspaceDirectory = async () => {
    setLoadingRepos(true);
    try {
      const context = await window.workspace.chooseDirectory();
      if (!context?.repo?.root) return;

      const repos = await window.github.listRepos(context.repo.root);
      setWorkspaceContext(context);
      setWorkspaceRepo(context.repo);
      setWorkspaceDir(context.repo.root);
      setGithubRepos(repos.length ? repos : [context.repo]);
      setGithubRepoName(context.repo.nameWithOwner);
    } finally {
      setLoadingRepos(false);
    }
  };

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  const handleProviderChange = (nextProvider) => {
    if (nextProvider === 'browser' && !canUseBrowserProvider) {
      setStatus('WebGPU tidak tersedia, tetap memakai Ollama.');
      return;
    }

    setEngineProvider(nextProvider);
    setStatus(nextProvider === 'browser' ? 'Mode browser inference aktif.' : 'Mode Ollama aktif.');
  };

  const handleActiveModelChange = (nextValue) => {
    if (engineProvider === 'browser') {
      setBrowserModel(nextValue);
      browserLoadedModelRef.current = '';
      setBrowserRuntimeStats('');
      setBrowserGpuVendor('');
      return;
    }

    setModel(nextValue);
  };

  return (
    <div className="app-shell">
      <WebGLBackground />
      <main className="chat-panel">
        <Topbar
          engineProvider={engineProvider}
          model={activeModelValue}
          models={activeModels}
          selected={activeSelectedModel}
          status={status}
          view={view}
          mode={mode}
          modes={chatModes}
          githubRepos={githubRepos}
          selectedRepo={selectedRepo}
          loadingRepos={loadingRepos}
          loadingModels={loadingModels || browserInitializing}
          generating={generating}
          onModelChange={handleActiveModelChange}
          onModeChange={setMode}
          onRepoChange={setGithubRepoName}
          onChooseWorkspace={chooseWorkspaceDirectory}
          onReloadRepos={loadGitHubRepos}
          onReloadModels={reloadActiveModels}
          onNewChat={startNewChat}
          onOpenSettings={() => setView('settings')}
          onBackToChat={() => setView('chat')}
        />
        {view === 'settings'
          ? (
            <SettingsPage
              memoryEnabled={memoryEnabled}
              autoCompactContext={autoCompactContext}
              engineProvider={engineProvider}
              browserSupported={browserSupported}
              browserInitializing={browserInitializing}
              browserProgress={browserProgress}
              browserGpuVendor={browserGpuVendor}
              browserRuntimeStats={browserRuntimeStats}
              browserModel={browserModel}
              browserModels={browserModels}
              onMemoryChange={setMemoryEnabled}
              onAutoCompactChange={setAutoCompactContext}
              onEngineProviderChange={handleProviderChange}
              onBrowserModelChange={setBrowserModel}
            />
          )
          : (
            <>
              <MessageList messages={messages} bottomRef={bottomRef} />
              <Composer
                input={input}
                model={activeModelReady ? activeModelValue : ''}
                generating={generating}
                onInputChange={setInput}
                onKeyDown={onKeyDown}
                onSend={send}
                onStop={stop}
              />
            </>
          )}
      </main>
    </div>
  );
}
