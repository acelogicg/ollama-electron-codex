const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const { promisify } = require('util');
const { AGENT_TOOLS, TOOL_OUTPUT_LIMIT, safeParseArgs, runAgentTool } = require('./agentTools.cjs');

const LMSTUDIO_URL = process.env.LMSTUDIO_URL || 'http://127.0.0.1:1234';
const activeRequests = new Map();
const execFileAsync = promisify(execFile);
const AGENT_MAX_STEPS = 16;
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

function inferCapabilities(id, type) {
  const name = String(id || '').toLowerCase();
  const embedding = type === 'embeddings' || /embed/.test(name);
  const vision = type === 'vlm' || /(^|[-_/])(vl|vlm|vision|llava|multimodal)([-_/]|$)/.test(name);
  const thinking = /think|reason|(^|[-_/])r1([-_/]|$)|deepseek-r1|qwq|magistral|(^|[-_/])o[13]([-_/]|$)/.test(name);
  const tools = !embedding;
  return { tools, thinking, vision, embedding };
}

ipcMain.handle('lmstudio:list-models', async (_event, baseUrl) => {
  // API native LM Studio (/api/v0) memberi metadata lebih kaya (type, arch) untuk
  // mendeteksi kapabilitas. Kalau tidak tersedia, fallback ke /v1/models.
  try {
    const response = await lmstudioFetch(baseUrl, '/api/v0/models');
    const data = await response.json();
    return (data.data || []).map((item) => ({
      name: item.id,
      label: item.id,
      type: item.type || 'llm',
      arch: item.arch || '',
      capabilities: inferCapabilities(item.id, item.type)
    }));
  } catch (_error) {
    const response = await lmstudioFetch(baseUrl, '/v1/models');
    const data = await response.json();
    return (data.data || []).map((item) => ({
      name: item.id,
      label: item.id,
      type: 'llm',
      arch: '',
      capabilities: inferCapabilities(item.id)
    }));
  }
});

ipcMain.handle('lmstudio:list-tools', () => (
  AGENT_TOOLS.map((tool) => ({ name: tool.function.name, description: tool.function.description }))
));

ipcMain.handle('lmstudio:suggest-tips', async (_event, { baseUrl, model, messages } = {}) => {
  if (!model || !Array.isArray(messages) || !messages.length) return [];

  const convo = messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content)
    .slice(-4)
    .map((m) => `${m.role === 'user' ? 'User' : 'Asisten'}: ${String(m.content).slice(0, 600)}`)
    .join('\n');

  const body = {
    model,
    stream: false,
    temperature: 0.5,
    // Longgar karena sebagian model bersifat "thinking" dan memakai token untuk reasoning
    // sebelum menghasilkan JSON.
    max_tokens: 512,
    messages: [
      {
        role: 'system',
        content: 'Kamu membuat saran tindak lanjut untuk chat agent coding. Berdasarkan percakapan, keluarkan 3 ide prompt lanjutan yang relevan dan bisa langsung dikirim user. Balas HANYA berupa JSON array of string (contoh: ["...","...","..."]), tanpa penjelasan lain. Tiap saran maksimal 6 kata, bahasa Indonesia, konkret, tetap dalam konteks coding/workspace.'
      },
      { role: 'user', content: `Percakapan:\n${convo}\n\nJSON array saran:` }
    ]
  };

  try {
    const response = await lmstudioFetch(baseUrl, '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start === -1 || end === -1 || end <= start) return [];
    const parsed = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()).slice(0, 4)
      : [];
  } catch (_error) {
    return [];
  }
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
    stream_options: { include_usage: true },
    temperature: options?.temperature ?? 0.7,
    ...(options || {})
  };
  if (tools && tools.length) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const startedAt = Date.now();
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
  let usage = null;
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
      if (json.usage) usage = json.usage;
      handleDelta(json.choices?.[0]);
    }
  }

  const toolCalls = [...toolCallsByIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, call]) => call)
    .filter((call) => call.name);

  return { content, toolCalls, finishReason, usage, elapsedMs: Date.now() - startedAt };
}

function buildStats({ completionTokens, promptTokens, totalTokens, elapsedMs, steps }) {
  const seconds = elapsedMs / 1000;
  const tokensPerSecond = seconds > 0 && completionTokens ? completionTokens / seconds : 0;
  return { tokensPerSecond, completionTokens, promptTokens, totalTokens, elapsedMs, steps };
}

// Deteksi jawaban "final" yang sebenarnya cuma minta izin / bertanya ke user
// alih-alih benar-benar bekerja (mis. "Apakah ada file yang ingin saya baca?").
function looksDeferring(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return false;
  if (/\?\s*$/.test(trimmed)) return true;
  return /(ingin saya baca|apakah ada file|file tertentu|anda perlu|anda harus|yang perlu saya lakukan|which file|should i (read|open)|shall i|do you want me to|let me know|beri tahu saya)/i.test(trimmed);
}

ipcMain.handle('lmstudio:chat', async (event, payload) => {
  const { requestId, model, messages, options, baseUrl } = payload;
  if (!requestId || !model) throw new Error('requestId dan model wajib diisi.');

  const controller = new AbortController();
  activeRequests.set(requestId, controller);

  try {
    const { usage, elapsedMs } = await streamCompletion({ event, requestId, baseUrl, model, messages, options, signal: controller.signal });
    event.sender.send('lmstudio:chat-done', {
      requestId,
      stats: buildStats({
        completionTokens: usage?.completion_tokens || 0,
        promptTokens: usage?.prompt_tokens || 0,
        totalTokens: usage?.total_tokens || 0,
        elapsedMs,
        steps: 1
      })
    });
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

ipcMain.handle('lmstudio:agent', async (event, payload) => {
  const { requestId, model, messages, options, baseUrl, workspaceRoot } = payload;
  if (!requestId || !model) throw new Error('requestId dan model wajib diisi.');

  const root = workspaceRoot || process.cwd();
  const controller = new AbortController();
  activeRequests.set(requestId, controller);
  const convo = [...messages];

  let totalCompletion = 0;
  let totalPrompt = 0;
  let totalTokens = 0;
  let genElapsed = 0;
  let completedSteps = 0;

  const accumulate = (usage, elapsedMs) => {
    completedSteps += 1;
    genElapsed += elapsedMs;
    if (usage) {
      totalCompletion += usage.completion_tokens || 0;
      totalPrompt += usage.prompt_tokens || 0;
      totalTokens += usage.total_tokens || 0;
    }
  };

  try {
    let sawFinalAnswer = false;
    let nudges = 0;
    const MAX_NUDGES = 2;

    for (let step = 0; step < AGENT_MAX_STEPS; step += 1) {
      const { content, toolCalls, usage, elapsedMs } = await streamCompletion({
        event,
        requestId,
        baseUrl,
        model,
        messages: convo,
        options,
        tools: AGENT_TOOLS,
        signal: controller.signal
      });

      accumulate(usage, elapsedMs);

      const assistantMessage = { role: 'assistant', content: content || '' };
      if (toolCalls.length) {
        assistantMessage.tool_calls = toolCalls.map((call, index) => ({
          id: call.id || `call_${step}_${index}`,
          type: 'function',
          function: { name: call.name, arguments: call.arguments || '{}' }
        }));
      }
      convo.push(assistantMessage);

      if (!toolCalls.length) {
        const finalText = (content || '').trim();
        // Model berhenti tanpa memakai tool memadai dan malah minta izin/bertanya:
        // dorong agar lanjut bekerja otomatis, bukan langsung diterima sebagai jawaban.
        if (finalText && looksDeferring(finalText) && nudges < MAX_NUDGES) {
          nudges += 1;
          convo.push({
            role: 'user',
            content: 'Jangan meminta izin dan jangan bertanya file mana. Lanjutkan sendiri: pakai read_file/search_text untuk membaca file sumber yang relevan, periksa kodenya, temukan bug konkret, lalu laporkan dengan path file. Teruskan memakai tool sampai benar-benar selesai.'
          });
          continue;
        }
        if (finalText) sawFinalAnswer = true;
        break;
      }

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

    // Model kadang berhenti setelah memakai tool tanpa memberi jawaban teks, atau batas
    // langkah tercapai. Paksa satu panggilan terakhir tanpa tool agar selalu ada ringkasan.
    if (!sawFinalAnswer && !controller.signal.aborted) {
      convo.push({
        role: 'user',
        content: 'Berikan jawaban/ringkasan akhir sekarang berdasarkan hasil tool di atas. Jangan panggil tool lagi.'
      });
      const { content, usage, elapsedMs } = await streamCompletion({
        event, requestId, baseUrl, model, messages: convo, options, signal: controller.signal
      });
      accumulate(usage, elapsedMs);

      if (!content || !content.trim()) {
        event.sender.send('lmstudio:chat-chunk', {
          requestId,
          data: { message: { content: 'Agent selesai menjalankan tool tetapi model tidak memberi ringkasan. Coba tanyakan detail spesifik, atau naikkan Context Length model di LM Studio.', thinking: '' } }
        });
      }
    }

    event.sender.send('lmstudio:chat-done', {
      requestId,
      stats: buildStats({
        completionTokens: totalCompletion,
        promptTokens: totalPrompt,
        totalTokens,
        elapsedMs: genElapsed,
        steps: completedSteps
      })
    });
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
