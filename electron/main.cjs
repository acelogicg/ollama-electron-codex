const { app, BrowserWindow, ipcMain } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const { promisify } = require('util');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const activeRequests = new Map();
const execFileAsync = promisify(execFile);

async function loadDevServer(win, attempts = 20) {
  const url = 'http://127.0.0.1:5173';

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await win.loadURL(url);
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: '#07111f',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.maximize();

  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  } else {
    loadDevServer(win).catch((error) => {
      console.error('Gagal memuat Vite dev server:', error);
    });
  }
}

async function ollamaFetch(route, options = {}) {
  const response = await fetch(`${OLLAMA_URL}${route}`, options);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Ollama HTTP ${response.status}`);
  }
  return response;
}

function isThinkingUnsupported(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('think') || message.includes('thinking');
}

function parseRemoteRepo(remote) {
  const clean = remote.trim().replace(/\.git$/, '');
  const sshMatch = clean.match(/github\.com[:/](.+\/.+)$/);
  if (!sshMatch) return null;

  const nameWithOwner = sshMatch[1];
  return {
    nameWithOwner,
    url: `https://github.com/${nameWithOwner}`,
    description: 'Current workspace',
    isPrivate: false,
    source: 'git'
  };
}

async function listGitHubRepos() {
  try {
    const { stdout } = await execFileAsync('gh', [
      'repo',
      'list',
      '--limit',
      '100',
      '--json',
      'nameWithOwner,url,description,isPrivate'
    ], { windowsHide: true });

    return JSON.parse(stdout).map((repo) => ({ ...repo, source: 'gh' }));
  } catch (_error) {
    try {
      const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], { windowsHide: true });
      const repo = parseRemoteRepo(stdout);
      return repo ? [repo] : [];
    } catch (_fallbackError) {
      return [];
    }
  }
}

ipcMain.handle('ollama:list-models', async () => {
  const response = await ollamaFetch('/api/tags');
  const data = await response.json();
  return data.models || [];
});

ipcMain.handle('github:list-repos', async () => listGitHubRepos());

ipcMain.handle('ollama:preload-model', async (_event, model) => {
  if (!model) throw new Error('Model belum dipilih.');
  const response = await ollamaFetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: '', stream: false, keep_alive: '30m' })
  });
  await response.json();
  return { ok: true };
});

ipcMain.handle('ollama:chat', async (event, payload) => {
  const { requestId, model, messages, options, think } = payload;
  if (!requestId || !model) throw new Error('requestId dan model wajib diisi.');

  const controller = new AbortController();
  activeRequests.set(requestId, controller);

  const streamChat = async (thinkValue) => {
    const body = {
      model,
      messages,
      stream: true,
      keep_alive: '30m',
      options: options || { temperature: 0.7 }
    };

    if (thinkValue !== undefined) body.think = thinkValue;

    const response = await ollamaFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(body)
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        const json = JSON.parse(line);
        event.sender.send('ollama:chat-chunk', { requestId, data: json });
      }
    }

    if (buffer.trim()) {
      const json = JSON.parse(buffer);
      event.sender.send('ollama:chat-chunk', { requestId, data: json });
    }

    event.sender.send('ollama:chat-done', { requestId });
  };

  try {
    const autoThink = model.toLowerCase().includes('gpt-oss') ? 'medium' : true;
    const thinkValue = think === 'auto' ? autoThink : think;

    try {
      await streamChat(thinkValue);
    } catch (error) {
      if (think === 'auto' && error.name !== 'AbortError' && isThinkingUnsupported(error)) {
        await streamChat(undefined);
      } else {
        throw error;
      }
    }

    return { ok: true };
  } catch (error) {
    if (error.name !== 'AbortError') {
      event.sender.send('ollama:chat-error', {
        requestId,
        message: error.message || 'Gagal menghubungi Ollama.'
      });
    }
    return { ok: false };
  } finally {
    activeRequests.delete(requestId);
  }
});

ipcMain.handle('ollama:cancel', async (_event, requestId) => {
  const controller = activeRequests.get(requestId);
  if (controller) controller.abort();
  return { ok: true };
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
