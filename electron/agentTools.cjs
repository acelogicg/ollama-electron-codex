const { execFile, exec } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);
const TOOL_OUTPUT_LIMIT = 12000;

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
  if (typeof text === 'object' && text !== null) return text;
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_error) {
    return {};
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

module.exports = { AGENT_TOOLS, TOOL_OUTPUT_LIMIT, safeParseArgs, resolveInsideRoot, runAgentTool };
