import { useEffect, useMemo, useRef, useState } from 'react';
import Composer from './components/Composer.jsx';
import MessageList from './components/MessageList.jsx';
import SettingsPage from './components/SettingsPage.jsx';
import Topbar from './components/Topbar.jsx';
import { buildChatHistory, buildSystemContext, chatModes } from './utils/chatContext.js';
import WebGLBackground from './WebGLBackground.jsx';

const initialMessages = [];

export default function App() {
  const [models, setModels] = useState([]);
  const [model, setModel] = useState(localStorage.getItem('lmstudio-model') || '');
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('Menghubungkan...');
  const [view, setView] = useState('chat');
  const [mode, setMode] = useState('agent');
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
  const [baseUrl, setBaseUrl] = useState(localStorage.getItem('lmstudio-base-url') || 'http://127.0.0.1:1234');
  const bottomRef = useRef(null);

  const selected = useMemo(() => models.find((item) => item.name === model), [models, model]);
  const selectedRepo = useMemo(() => (
    githubRepos.find((repo) => repo.nameWithOwner === githubRepoName) || null
  ), [githubRepos, githubRepoName]);

  const activeModelReady = Boolean(model);

  const loadModels = async () => {
    setLoadingModels(true);
    setStatus('Memuat model LM Studio...');
    try {
      const list = await window.lmstudio.listModels(baseUrl);
      setModels(list);
      const preferred = list.some((item) => item.name === model) ? model : list[0]?.name || '';
      setModel(preferred);
      setStatus(list.length ? 'Siap' : 'Model LM Studio tidak ditemukan');
    } catch (error) {
      setStatus(`LM Studio offline: ${error.message}`);
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

  const reloadActiveModels = async () => {
    await loadModels();
  };

  useEffect(() => { loadModels(); }, []);
  useEffect(() => { loadGitHubRepos(); }, []);

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
    localStorage.setItem('lmstudio-base-url', baseUrl);
  }, [baseUrl]);

  useEffect(() => {
    if (!model) return;
    localStorage.setItem('lmstudio-model', model);
    setStatus('Memuat model LM Studio...');
    window.lmstudio.preloadModel(model, baseUrl)
      .then(() => setStatus('Siap'))
      .catch((error) => setStatus(`Gagal: ${error.message}`));
  }, [model, baseUrl]);

  useEffect(() => {
    const offChunk = window.lmstudio.onChunk(({ requestId: id, data }) => {
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
        } else {
          // Setelah tool dijalankan, mulai bubble asisten baru untuk langkah berikutnya.
          next.push({ role: 'assistant', content: text, thinking, thinkingActive: Boolean(thinking && !text), streaming: true });
        }
        return next;
      });
    });

    const offTool = window.lmstudio.onTool(({ requestId: id, phase, id: toolId, name, arguments: args, result }) => {
      if (id !== requestId) return;
      if (phase === 'call') {
        setMessages((current) => {
          const finalized = current
            .map((message) => (message.streaming ? { ...message, streaming: false } : message))
            .filter((message) => !(message.role === 'assistant' && !message.content?.trim()));
          return [...finalized, { role: 'tool', toolId, name, args, status: 'running' }];
        });
      } else if (phase === 'result') {
        setMessages((current) => current.map((message) => (
          message.role === 'tool' && message.toolId === toolId
            ? { ...message, result, status: 'done' }
            : message
        )));
      }
    });

    const offDone = window.lmstudio.onDone(({ requestId: id }) => {
      if (id !== requestId) return;
      setMessages((current) => current
        .map((message) => (message.streaming ? { ...message, streaming: false } : message))
        .filter((message) => !(message.role === 'assistant' && !message.content?.trim())));
      setGenerating(false);
      setRequestId(null);
      setStatus('Siap');
    });

    const offError = window.lmstudio.onError(({ requestId: id, message }) => {
      if (id !== requestId) return;
      setMessages((current) => current.map((item) => (
        item.streaming ? { ...item, streaming: false, content: `Error: ${message}` } : item
      )));
      setGenerating(false);
      setRequestId(null);
      setStatus('Error');
    });

    return () => { offChunk(); offTool(); offDone(); offError(); };
  }, [requestId]);

  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages]);

  const send = async () => {
    const content = input.trim();
    if (!content || !activeModelReady || generating) return;

    const id = crypto.randomUUID();
    const userMessage = { role: 'user', content };
    const chatHistory = buildChatHistory(messages, userMessage, { memoryEnabled, autoCompactContext });
    const history = [buildSystemContext(mode, selectedRepo, workspaceRepo, workspaceContext), ...chatHistory];

    setInput('');
    setGenerating(true);
    setStatus('Agent bekerja...');
    setMessages((current) => [...current, userMessage, { role: 'assistant', content: '', streaming: true }]);

    setRequestId(id);
    await window.lmstudio.agentRun({
      requestId: id,
      model,
      messages: history,
      options: { temperature: 0.7 },
      baseUrl,
      workspaceRoot: workspaceRepo?.root || workspaceDir || ''
    });
  };

  const cancelActiveRequest = async () => {
    if (!requestId) return false;
    await window.lmstudio.cancel(requestId);
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

  const handleBaseUrlChange = (nextValue) => {
    setBaseUrl(nextValue);
  };

  const applyBaseUrl = async () => {
    setStatus('Menghubungkan ke LM Studio...');
    await loadModels();
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
          view={view}
          mode={mode}
          modes={chatModes}
          githubRepos={githubRepos}
          selectedRepo={selectedRepo}
          loadingRepos={loadingRepos}
          loadingModels={loadingModels}
          generating={generating}
          onModelChange={setModel}
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
              baseUrl={baseUrl}
              models={models}
              model={model}
              loadingModels={loadingModels}
              onBaseUrlChange={handleBaseUrlChange}
              onApplyBaseUrl={applyBaseUrl}
              onRefreshModels={reloadActiveModels}
              onModelChange={setModel}
              onMemoryChange={setMemoryEnabled}
              onAutoCompactChange={setAutoCompactContext}
            />
          )
          : (
            <>
              <MessageList messages={messages} bottomRef={bottomRef} />
              <Composer
                input={input}
                model={activeModelReady ? model : ''}
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
