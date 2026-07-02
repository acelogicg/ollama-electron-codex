const { execFile, exec } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);
const TOOL_OUTPUT_LIMIT = 12000;
const PROJECT_MANIFESTS = new Set([
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'Pipfile',
  'poetry.lock',
  'Cargo.toml',
  'go.mod',
  'composer.json',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts'
]);

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
      description: 'Ganti kemunculan pertama old_text dengan new_text di sebuah file. Baca file lebih dulu; old_text harus cocok dengan isi aktual. Perbedaan line ending LF/CRLF ditangani otomatis.',
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
      description: 'Cari teks/regex pada file di dalam workspace (via git grep).',
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
      name: 'inspect_project',
      description: 'Deteksi manifest, dependency manager, environment, dan command validasi project sebelum menjalankan command.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Jalankan perintah shell di root workspace dan kembalikan stdout/stderr. Wajib panggil inspect_project lebih dulu. Timeout 60 detik.',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command']
      }
    }
  }
];

function safeParseArgs(text) {
  if (typeof text === 'object' && text !== null) return text;
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Argumen tool bukan JSON valid: ${error.message}. Argumen mentah: ${String(text).slice(0, 500)}`);
  }
}

function resolveInsideRoot(root, relPath) {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, relPath || '.');
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error('Path berada di luar root workspace.');
  }
  return target;
}

async function findFileSuggestions(root, relPath, limit = 6) {
  const wantedName = path.basename(String(relPath || '')).toLowerCase();
  if (!wantedName) return [];

  const suggestions = [];
  const pending = [path.resolve(root)];
  const ignored = new Set(['.git', 'node_modules', 'dist', 'build', 'release']);
  let inspected = 0;

  while (pending.length && suggestions.length < limit && inspected < 2000) {
    const directory = pending.shift();
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (_error) {
      continue;
    }

    for (const entry of entries) {
      inspected += 1;
      if (entry.isDirectory()) {
        if (!ignored.has(entry.name)) pending.push(path.join(directory, entry.name));
      } else if (entry.name.toLowerCase() === wantedName) {
        suggestions.push(path.relative(root, path.join(directory, entry.name)).replace(/\\/g, '/'));
        if (suggestions.length >= limit) break;
      }
    }
  }

  return suggestions;
}

async function inspectProject(root) {
  const resolvedRoot = path.resolve(root);
  const found = [];
  const pending = [{ directory: resolvedRoot, depth: 0 }];
  const ignored = new Set(['.git', 'node_modules', 'dist', 'build', 'release', '.next', 'vendor', 'target']);
  let inspected = 0;

  while (pending.length && inspected < 1000) {
    const { directory, depth } = pending.shift();
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (_error) {
      continue;
    }

    for (const entry of entries) {
      inspected += 1;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (depth < 2 && !ignored.has(entry.name) && !entry.name.startsWith('.')) {
          pending.push({ directory: fullPath, depth: depth + 1 });
        }
        continue;
      }

      if (
        PROJECT_MANIFESTS.has(entry.name)
        || /\.sln$/i.test(entry.name)
        || /\.csproj$/i.test(entry.name)
      ) {
        found.push(fullPath);
      }
    }
  }

  const projects = [];
  for (const manifestPath of found.slice(0, 30)) {
    const relativePath = path.relative(resolvedRoot, manifestPath).replace(/\\/g, '/');
    const directory = path.dirname(manifestPath);
    const name = path.basename(manifestPath);

    if (name === 'package.json') {
      let pkg = {};
      try {
        pkg = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
      } catch (_error) {
        // Tetap laporkan manifest meski JSON rusak.
      }
      const siblingNames = new Set(await fs.readdir(directory).catch(() => []));
      const manager = siblingNames.has('pnpm-lock.yaml')
        ? 'pnpm'
        : (siblingNames.has('yarn.lock')
          ? 'yarn'
          : (siblingNames.has('bun.lockb') || siblingNames.has('bun.lock') ? 'bun' : 'npm'));
      projects.push({
        ecosystem: 'node',
        manifest: relativePath,
        working_directory: path.relative(resolvedRoot, directory).replace(/\\/g, '/') || '.',
        package_manager: pkg.packageManager || manager,
        dependencies_installed: siblingNames.has('node_modules'),
        scripts: Object.keys(pkg.scripts || {})
      });
      continue;
    }

    if (['pyproject.toml', 'requirements.txt', 'Pipfile', 'poetry.lock'].includes(name)) {
      const siblingNames = new Set(await fs.readdir(directory).catch(() => []));
      projects.push({
        ecosystem: 'python',
        manifest: relativePath,
        working_directory: path.relative(resolvedRoot, directory).replace(/\\/g, '/') || '.',
        manager: name === 'Pipfile' ? 'pipenv' : (name === 'poetry.lock' ? 'poetry' : (name === 'pyproject.toml' ? 'pyproject' : 'pip')),
        virtual_environment: siblingNames.has('.venv') ? '.venv' : (siblingNames.has('venv') ? 'venv' : null)
      });
      continue;
    }

    const ecosystem = name === 'Cargo.toml'
      ? 'rust'
      : (name === 'go.mod'
        ? 'go'
        : (name === 'composer.json'
          ? 'php'
          : (/^(pom\.xml|build\.gradle(?:\.kts)?)$/.test(name)
            ? 'java'
            : (/\.(sln|csproj)$/i.test(name) ? 'dotnet' : 'unknown'))));
    projects.push({
      ecosystem,
      manifest: relativePath,
      working_directory: path.relative(resolvedRoot, directory).replace(/\\/g, '/') || '.'
    });
  }

  return JSON.stringify({
    workspace: resolvedRoot,
    projects,
    guidance: projects.length
      ? 'Gunakan working_directory, package manager, virtual environment, dan scripts yang terdeteksi. Jangan install/update dependency tanpa diminta.'
      : 'Tidak ada manifest project yang terdeteksi hingga kedalaman 2. Gunakan command generik yang aman dan jangan mengasumsikan dependency tersedia.'
  }, null, 2);
}

async function runAgentTool(name, args, root) {
  switch (name) {
    case 'read_file': {
      const target = resolveInsideRoot(root, args.path);
      let content;
      try {
        content = await fs.readFile(target, 'utf8');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        const suggestions = await findFileSuggestions(root, args.path);
        const hint = suggestions.length
          ? ` Kandidat path: ${suggestions.join(', ')}. Coba read_file lagi memakai kandidat yang sesuai.`
          : ' Gunakan list_directory atau search_text untuk menemukan path yang benar, lalu coba read_file lagi.';
        throw new Error(`File "${args.path}" tidak ditemukan.${hint}`);
      }
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
      if (typeof args.path !== 'string' || !args.path.trim()) {
        throw new Error('path edit_file wajib berupa path file relatif yang tidak kosong.');
      }
      if (typeof args.old_text !== 'string' || !args.old_text) {
        throw new Error('old_text edit_file wajib diisi. Baca file terlebih dahulu lalu kirim teks yang cocok.');
      }
      if (typeof args.new_text !== 'string') {
        throw new Error('new_text edit_file wajib berupa string. Gunakan string kosong jika memang ingin menghapus old_text.');
      }

      const target = resolveInsideRoot(root, args.path);
      let original;
      try {
        original = await fs.readFile(target, 'utf8');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        const suggestions = await findFileSuggestions(root, args.path);
        const hint = suggestions.length ? ` Kandidat path: ${suggestions.join(', ')}.` : '';
        throw new Error(`File "${args.path}" tidak ditemukan.${hint}`);
      }

      let matchedText = args.old_text;
      let replacementText = args.new_text;
      if (!original.includes(matchedText)) {
        const crlfOldText = args.old_text.replace(/\r?\n/g, '\r\n');
        const lfOldText = args.old_text.replace(/\r\n/g, '\n');
        if (original.includes(crlfOldText)) {
          matchedText = crlfOldText;
          replacementText = args.new_text.replace(/\r?\n/g, '\r\n');
        } else if (original.includes(lfOldText)) {
          matchedText = lfOldText;
          replacementText = args.new_text.replace(/\r\n/g, '\n');
        } else {
          const anchor = args.old_text
            .split(/\r?\n/)
            .map((line) => line.trim())
            .find((line) => line.length >= 4);
          const anchorIndex = anchor ? original.indexOf(anchor) : -1;
          const context = anchorIndex >= 0
            ? ` Bagian yang mirip ditemukan, tetapi blok tidak cocok:\n${original.slice(Math.max(0, anchorIndex - 180), anchorIndex + anchor.length + 180)}`
            : '';
          throw new Error(`old_text tidak ditemukan di "${args.path}". Baca ulang file dan gunakan teks aktual yang cocok persis.${context}`);
        }
      }

      const updated = original.replace(matchedText, replacementText);
      await fs.writeFile(target, updated, 'utf8');
      const confirmed = await fs.readFile(target, 'utf8');
      if (confirmed !== updated) {
        throw new Error(`Verifikasi edit "${args.path}" gagal: isi setelah ditulis tidak sama dengan hasil yang diharapkan.`);
      }
      return `OK: mengedit dan memverifikasi ${args.path} (${matchedText.length} karakter diganti).`;
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
    case 'inspect_project':
      return inspectProject(root);
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

module.exports = {
  AGENT_TOOLS,
  TOOL_OUTPUT_LIMIT,
  safeParseArgs,
  resolveInsideRoot,
  findFileSuggestions,
  inspectProject,
  runAgentTool
};
