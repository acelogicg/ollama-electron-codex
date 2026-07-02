const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { execFile, exec } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const { promisify } = require('util');

const LMSTUDIO_URL = process.env.LMSTUDIO_URL || 'http://127.0.0.1:1234';
const activeRequests = new Map();
const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);
const AGENT_MAX_STEPS = 16;
const TOOL_OUTPUT_LIMIT = 20000;
const MAX_CONTEXT_FILES = 10;
const MAX_FILE_CHARS = 4000;
const MAX_TREE_FILES = 160;
const contextFilePatterns = [
  /^package\.json$/,
  /^README\.md$/i,
  /^src\/App\.jsx$/,
  /^src\/main\.jsx$/,
  /^electron\/main\.cjs$/,
  /^electron\/preload\.cjs$/,
  /^vite\.config\.js$/,
  /^src\/components\/.*\.(jsx|js)$/,
  /^src\/utils\/.*\.(jsx|js)$/
];

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

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
      nodeIntegration: false,
      webgl: true
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

function resolveBaseUrl(baseUrl) {
  const url = (typeof baseUrl === 'string' && baseUrl.trim()) || LMSTUDIO_URL;
  return url.replace(/\/+$/, '');
}

async function lmstudioFetch(baseUrl, route, options = {}) {
  const response = await fetch(`${resolveBaseUrl(baseUrl)}${route}`, options);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `LM Studio HTTP ${response.status}`);
  }
  return response;
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

async function execGit(args, cwd = process.cwd()) {
  const { stdout } = await execFileAsync('git', args, { cwd, windowsHide: true });
  return stdout.trim();
}

function normalizeRepoPath(filePath) {
  return filePath.replace(/\\/g, '/');
}

function isUsefulContextFile(filePath) {
  const normalized = normalizeRepoPath(filePath);
  return contextFilePatterns.some((pattern) => pattern.test(normalized));
}

function keepWithinRoot(root, filePath) {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(root, filePath);
  return resolvedPath === resolvedRoot || resolvedPath.startsWith(`${resolvedRoot}${path.sep}`);
}

async function getWorkspaceRepo(cwd = process.cwd()) {
  try {
    const root = await execGit(['rev-parse', '--show-toplevel'], cwd);
    const [branch, remote, status, commits] = await Promise.all([
      execGit(['branch', '--show-current'], root).catch(() => ''),
      execGit(['remote', 'get-url', 'origin'], root).catch(() => ''),
      execGit(['status', '--short'], root).catch(() => ''),
      execGit(['log', '-5', '--pretty=format:%h %s'], root).catch(() => '')
    ]);
    const repo = parseRemoteRepo(remote);

    return {
      root,
      branch,
      remote,
      status,
      commits,
      nameWithOwner: repo?.nameWithOwner || path.basename(root),
      url: repo?.url || '',
      description: repo?.description || 'Current workspace',
      isPrivate: repo?.isPrivate || false,
      source: repo ? 'git' : 'local'
    };
  } catch (_error) {
    return null;
  }
}

async function getWorkspaceContext(cwd = process.cwd()) {
  const repo = await getWorkspaceRepo(cwd);
  if (!repo?.root) return null;

  try {
    const [trackedFiles, diffStat, diff, branches] = await Promise.all([
      execGit(['ls-files'], repo.root).catch(() => ''),
      execGit(['diff', '--stat'], repo.root).catch(() => ''),
      execGit(['diff', '--', ':!package-lock.json'], repo.root).catch(() => ''),
      execGit(['branch', '--list'], repo.root).catch(() => '')
    ]);

    const files = trackedFiles.split(/\r?\n/).filter(Boolean).map(normalizeRepoPath);
    const selectedFiles = files.filter(isUsefulContextFile).slice(0, MAX_CONTEXT_FILES);
    const snippets = [];

    for (const filePath of selectedFiles) {
      if (!keepWithinRoot(repo.root, filePath)) continue;
      try {
        const content = await fs.readFile(path.join(repo.root, filePath), 'utf8');
        snippets.push({
          path: filePath,
          content: content.slice(0, MAX_FILE_CHARS),
          truncated: content.length > MAX_FILE_CHARS
        });
      } catch (_error) {
        // Skip unreadable files without failing the whole workspace context.
      }
    }

    return {
      repo,
      files: files.slice(0, MAX_TREE_FILES),
      omittedFileCount: Math.max(files.length - MAX_TREE_FILES, 0),
      snippets,
      git: {
        status: repo.status,
        diffStat,
        diff: diff.slice(0, 12000),
        diffTruncated: diff.length > 12000,
        branches,
        commits: repo.commits
      }
    };
  } catch (_error) {
    return { repo, files: [], omittedFileCount: 0, snippets: [], git: { status: repo.status, commits: repo.commits } };
  }
}

async function listGitHubRepos(cwd = process.cwd()) {
  const workspaceRepo = await getWorkspaceRepo(cwd);

  try {
    const { stdout } = await execFileAsync('gh', [
      'repo',
      'list',
      '--limit',
      '100',
      '--json',
      'nameWithOwner,url,description,isPrivate'
    ], { windowsHide: true });

    const repos = JSON.parse(stdout).map((repo) => ({ ...repo, source: 'gh' }));
    if (!workspaceRepo) return repos;

    const exists = repos.some((repo) => repo.nameWithOwner === workspaceRepo.nameWithOwner);
    return exists
      ? repos.map((repo) => repo.nameWithOwner === workspaceRepo.nameWithOwner ? { ...repo, ...workspaceRepo, source: 'git+gh' } : repo)
      : [workspaceRepo, ...repos];
  } catch (_error) {
    return workspaceRepo ? [workspaceRepo] : [];
  }
}

ipcMain.handle('lmstudio:list-models', async (_event, baseUrl) => {
  const response = await lmstudioFetch(baseUrl, '/v1/models');
  const data = await response.json();
  return (data.data || []).map((item) => ({ name: item.id, label: item.id }));
});

ipcMain.handle('github:list-repos', async (_event, cwd) => listGitHubRepos(cwd || process.cwd()));
ipcMain.handle('github:get-workspace-repo', async (_event, cwd) => getWorkspaceRepo(cwd || process.cwd()));
ipcMain.handle('workspace:get-context', async (_event, cwd) => getWorkspaceContext(cwd || process.cwd()));
ipcMain.handle('workspace:choose-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Pilih direktori repo'
  });

  if (result.canceled || !result.filePaths.length) return null;
  return getWorkspaceContext(result.filePaths[0]);
});
ipcMain.handle('git:status', async (_event, cwd) => {
  const repo = await getWorkspaceRepo(cwd || process.cwd());
  return repo?.root ? execGit(['status', '--short'], repo.root) : '';
});
ipcMain.handle('git:diff', async (_event, cwd) => {
  const repo = await getWorkspaceRepo(cwd || process.cwd());
  return repo?.root ? execGit(['diff'], repo.root) : '';
});
ipcMain.handle('git:log', async (_event, cwd) => {
  const repo = await getWorkspaceRepo(cwd || process.cwd());
  return repo?.root ? execGit(['log', '-20', '--pretty=format:%h %s'], repo.root) : '';
});

ipcMain.handle('lmstudio:preload-model', async (_event, { model, baseUrl } = {}) => {
  if (!model) throw new Error('Model belum dipilih.');
  // LM Studio memuat model secara JIT saat request pertama. Kirim prompt minimal
  // agar model sudah panas sebelum chat sungguhan.
  const response = await lmstudioFetch(baseUrl, '/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
      stream: false
    })
  });
  await response.json();
  return { ok: true };
});

function emitDelta(event, requestId, delta) {
  const content = delta?.content || '';
  const thinking = delta?.reasoning_content || delta?.reasoning || '';
  if (!content && !thinking) return;
  event.sender.send('lmstudio:chat-chunk', {
    requestId,
    data: { message: { content, thinking } }
  });
}

// Menstream satu panggilan /v1/chat/completions. Mengalirkan teks ke renderer via
// emitDelta dan mengakumulasi tool_calls (format OpenAI) untuk dipakai agent loop.
async function streamCompletion({ event, requestId, baseUrl, model, messages, options, tools, signal }) {
  const body = {
    model,
    messages,
    stream: true,
    temperature: options?.temperature ?? 0.7,
    ...(options || {})
  };
  if (tools && tools.length) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const response = await lmstudioFetch(baseUrl, '/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify(body)
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let finishReason = null;
  const toolCallsByIndex = new Map();

  const handleDelta = (choice) => {
    const delta = choice?.delta;
    if (!delta) return;
    if (delta.content) content += delta.content;
    emitDelta(event, requestId, delta);
    if (choice.finish_reason) finishReason = choice.finish_reason;

    for (const call of delta.tool_calls || []) {
      const index = call.index ?? 0;
      const existing = toolCallsByIndex.get(index) || { id: '', name: '', arguments: '' };
      if (call.id) existing.id = call.id;
      if (call.function?.name) existing.name = call.function.name;
      if (call.function?.arguments) existing.arguments += call.function.arguments;
      toolCallsByIndex.set(index, existing);
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const payloadText = trimmed.slice(5).trim();
      if (payloadText === '[DONE]') continue;
      const json = JSON.parse(payloadText);
      handleDelta(json.choices?.[0]);
    }
  }

  const toolCalls = [...toolCallsByIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, call]) => call)
    .filter((call) => call.name);

  return { content, toolCalls, finishReason };
}

ipcMain.handle('lmstudio:chat', async (event, payload) => {
  const { requestId, model, messages, options, baseUrl } = payload;
  if (!requestId || !model) throw new Error('requestId dan model wajib diisi.');

  const controller = new AbortController();
  activeRequests.set(requestId, controller);

  try {
    await streamCompletion({ event, requestId, baseUrl, model, messages, options, signal: controller.signal });
    event.sender.send('lmstudio:chat-done', { requestId });
    return { ok: true };
  } catch (error) {
    if (error.name !== 'AbortError') {
      event.sender.send('lmstudio:chat-error', {
        requestId,
        message: error.message || 'Gagal menghubungi LM Studio.'
      });
    }
    return { ok: false };
  } finally {
    activeRequests.delete(requestId);
  }
});

// --- Agent tools ------------------------------------------------------------

const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Baca isi file teks (UTF-8) relatif terhadap root workspace.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Path relatif file.' } },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Buat atau timpa file teks relatif terhadap root workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Ganti kemunculan pertama old_text dengan new_text di sebuah file. old_text harus cocok persis.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          old_text: { type: 'string' },
          new_text: { type: 'string' }
        },
        required: ['path', 'old_text', 'new_text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'Daftar file dan folder pada direktori relatif terhadap root workspace.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Kosongkan untuk root.' } },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_text',
      description: 'Cari teks/regex pada file di dalam workspace (via git grep / ripgrep).',
      parameters: {
        type: 'object',
        properties: { pattern: { type: 'string' } },
        required: ['pattern']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Jalankan perintah shell di root workspace dan kembalikan stdout/stderr. Timeout 60 detik.',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command']
      }
    }
  }
];

function safeParseArgs(text) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_error) {
    return {};
  }
}

function resolveInsideRoot(root, relPath) {
  const target = path.resolve(root, relPath || '.');
  if (target !== path.resolve(root) && !target.startsWith(`${path.resolve(root)}${path.sep}`)) {
    throw new Error('Path berada di luar root workspace.');
  }
  return target;
}

async function runAgentTool(name, args, root) {
  switch (name) {
    case 'read_file': {
      const target = resolveInsideRoot(root, args.path);
      const content = await fs.readFile(target, 'utf8');
      return content.length > TOOL_OUTPUT_LIMIT
        ? `${content.slice(0, TOOL_OUTPUT_LIMIT)}\n... [dipotong, ${content.length} karakter total]`
        : content;
    }
    case 'write_file': {
      const target = resolveInsideRoot(root, args.path);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, args.content ?? '', 'utf8');
      return `OK: menulis ${args.path} (${(args.content ?? '').length} karakter).`;
    }
    case 'edit_file': {
      const target = resolveInsideRoot(root, args.path);
      const original = await fs.readFile(target, 'utf8');
      if (!args.old_text || !original.includes(args.old_text)) {
        throw new Error('old_text tidak ditemukan di file. Baca file dulu untuk mencocokkan teks persis.');
      }
      const updated = original.replace(args.old_text, args.new_text ?? '');
      await fs.writeFile(target, updated, 'utf8');
      return `OK: mengedit ${args.path}.`;
    }
    case 'list_directory': {
      const target = resolveInsideRoot(root, args.path);
      const entries = await fs.readdir(target, { withFileTypes: true });
      return entries
        .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
        .sort()
        .join('\n') || '(kosong)';
    }
    case 'search_text': {
      if (!args.pattern) throw new Error('pattern wajib diisi.');
      try {
        const { stdout } = await execFileAsync('git', ['grep', '-n', '-I', '--', args.pattern], { cwd: root, windowsHide: true });
        return stdout.slice(0, TOOL_OUTPUT_LIMIT) || '(tidak ada kecocokan)';
      } catch (error) {
        if (error.code === 1) return '(tidak ada kecocokan)';
        throw error;
      }
    }
    case 'run_command': {
      if (!args.command) throw new Error('command wajib diisi.');
      try {
        const { stdout, stderr } = await execAsync(args.command, {
          cwd: root,
          windowsHide: true,
          timeout: 60000,
          maxBuffer: 4 * 1024 * 1024
        });
        const out = `${stdout || ''}${stderr ? `\n[stderr]\n${stderr}` : ''}`.trim();
        return (out || '(tidak ada output)').slice(0, TOOL_OUTPUT_LIMIT);
      } catch (error) {
        const detail = `${error.stdout || ''}${error.stderr || ''}`.trim();
        return `EXIT ${error.code ?? '?'}: ${error.message}\n${detail}`.slice(0, TOOL_OUTPUT_LIMIT);
      }
    }
    default:
      throw new Error(`Tool tidak dikenal: ${name}`);
  }
}

ipcMain.handle('lmstudio:agent', async (event, payload) => {
  const { requestId, model, messages, options, baseUrl, workspaceRoot } = payload;
  if (!requestId || !model) throw new Error('requestId dan model wajib diisi.');

  const root = workspaceRoot || process.cwd();
  const controller = new AbortController();
  activeRequests.set(requestId, controller);
  const convo = [...messages];

  try {
    for (let step = 0; step < AGENT_MAX_STEPS; step += 1) {
      const { content, toolCalls } = await streamCompletion({
        event,
        requestId,
        baseUrl,
        model,
        messages: convo,
        options,
        tools: AGENT_TOOLS,
        signal: controller.signal
      });

      const assistantMessage = { role: 'assistant', content: content || '' };
      if (toolCalls.length) {
        assistantMessage.tool_calls = toolCalls.map((call, index) => ({
          id: call.id || `call_${step}_${index}`,
          type: 'function',
          function: { name: call.name, arguments: call.arguments || '{}' }
        }));
      }
      convo.push(assistantMessage);

      if (!toolCalls.length) break;

      for (let index = 0; index < toolCalls.length; index += 1) {
        const call = toolCalls[index];
        const callId = assistantMessage.tool_calls[index].id;
        const args = safeParseArgs(call.arguments);
        event.sender.send('lmstudio:agent-tool', {
          requestId, phase: 'call', id: callId, name: call.name, arguments: args
        });

        let result;
        try {
          result = await runAgentTool(call.name, args, root);
        } catch (error) {
          result = `ERROR: ${error.message}`;
        }

        event.sender.send('lmstudio:agent-tool', {
          requestId, phase: 'result', id: callId, name: call.name, result
        });
        convo.push({ role: 'tool', tool_call_id: callId, content: String(result).slice(0, TOOL_OUTPUT_LIMIT) });
      }
    }

    event.sender.send('lmstudio:chat-done', { requestId });
    return { ok: true };
  } catch (error) {
    if (error.name !== 'AbortError') {
      event.sender.send('lmstudio:chat-error', {
        requestId,
        message: error.message || 'Gagal menghubungi LM Studio.'
      });
    }
    return { ok: false };
  } finally {
    activeRequests.delete(requestId);
  }
});

ipcMain.handle('lmstudio:cancel', async (_event, requestId) => {
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
