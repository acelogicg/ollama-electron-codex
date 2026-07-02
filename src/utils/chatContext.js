export const chatModes = [
  {
    id: 'agent',
    icon: 'agent',
    title: 'Agent',
    instruction: [
      'You are a fully autonomous coding agent working inside the user\'s workspace, like Cline or Codex.',
      'You have real tools: read_file, write_file, edit_file, list_directory, search_text, and run_command. All paths are relative to the workspace root.',
      'CRITICAL — work autonomously: NEVER ask the user for permission and NEVER ask which file to read. Decide yourself and keep calling tools until the task is genuinely done.',
      'Do NOT stop after only listing the directory. After list_directory you MUST proceed to actually read the relevant source files with read_file (and use search_text) before drawing any conclusion.',
      'To find bugs: list the tree, then read the important source files (entry points, pages, services, components), inspect the code for real issues (logic errors, missing dependency arrays, unhandled errors, race conditions, wrong conditions), and report concrete findings citing file path and line.',
      'You may call multiple tools across many turns. Only give a final answer AFTER you have actually read the relevant code — never a final answer that merely says you still need to read files.',
      'Read a file before editing so old_text matches exactly, and prefer edit_file for small changes. Never claim you changed or inspected a file unless you actually called the tool.',
      'MANDATORY AFTER EVERY write_file/edit_file: read every changed file again, inspect the actual result, then run a relevant check/build/test with run_command. If any tool or validation fails or the result does not match the request, diagnose it, edit again, and repeat verification. Only report completion after the final edit has been re-read and validation succeeds; include changed files and validation results in the report.',
      'AUTOMATIC TASK ORCHESTRATION: infer the concrete objective and acceptance criteria from each user prompt. For change requests, inspect the relevant implementation first, choose the smallest robust solution that fits the existing architecture and style, implement it directly, verify behavior and regressions, repair failures automatically, and only then report the outcome. Make reasonable evidence-based assumptions when details are minor; ask the user only when genuinely different product outcomes cannot be inferred from the repository.'
    ].join(' ')
  }
];

export function buildChatHistory(messages, userMessage, { memoryEnabled, autoCompactContext }) {
  if (!memoryEnabled) return [userMessage];

  // Hanya kirim ulang giliran user/assistant yang berisi teks. Pesan tool (aktivitas
  // agent) hanya untuk tampilan dan dikelola ulang oleh agent loop di main process.
  const previous = messages.filter((message) => (
    !message.streaming
    && (message.role === 'user' || message.role === 'assistant')
    && message.content?.trim()
  ));
  const history = [...previous, userMessage].map(({ role, content }) => ({ role, content }));

  if (!autoCompactContext || history.length <= 12) return history;

  const recent = history.slice(-10);
  const older = history.slice(0, -10);
  const compacted = older
    .map((message) => `${message.role}: ${message.content.replace(/\s+/g, ' ').trim()}`)
    .join('\n')
    .slice(-4000);

  return [
    {
      role: 'system',
      content: `Compacted previous conversation:\n${compacted}`
    },
    ...recent
  ];
}

const MAX_TREE_IN_PROMPT = 80;

// Konteks agent sengaja dibuat ramping: model bisa membaca isi file & diff sendiri
// lewat tool (read_file, search_text, run_command). Menjejalkan seluruh isi file dan
// diff ke system prompt membuat konteks membengkak dan model kecil bisa stall/terpotong.
function appendWorkspaceContext(lines, workspaceContext) {
  if (!workspaceContext) return;

  if (workspaceContext.files?.length) {
    const shown = workspaceContext.files.slice(0, MAX_TREE_IN_PROMPT);
    const omitted = workspaceContext.files.length - shown.length + (workspaceContext.omittedFileCount || 0);
    lines.push(`Workspace file tree (${workspaceContext.files.length}${omitted ? ` + ${omitted} omitted` : ''}) — gunakan read_file untuk membaca isinya:`);
    lines.push(shown.join('\n'));
  }

  if (workspaceContext.git?.diffStat) {
    lines.push(`Git diff stat (pakai run_command "git diff" untuk detail):\n${workspaceContext.git.diffStat}`);
  }

  if (workspaceContext.git?.branches) {
    lines.push(`Git branches:\n${workspaceContext.git.branches}`);
  }
}

export function buildSystemContext(modeId, githubRepo, workspaceRepo, workspaceContext) {
  const mode = chatModes.find((item) => item.id === modeId) || chatModes[0];
  const lines = [
    `Mode: ${mode.title}.`,
    mode.instruction,
    'Use the provided workspace/codebase and git context when it is relevant. Do not claim to have changed files or run git write actions unless the user explicitly asks and the app exposes that action.',
    'When answering the user, prefer plain text or simple bullets. Avoid raw markdown heading markers like #, ##, ###, and avoid wrapping short summaries in report-style sections unless the user explicitly asks for that format.'
  ];

  if (githubRepo?.nameWithOwner) {
    lines.push(`GitHub repository context: ${githubRepo.nameWithOwner}.`);
    if (githubRepo.url) lines.push(`Repository URL: ${githubRepo.url}.`);
    if (githubRepo.description) lines.push(`Repository description: ${githubRepo.description}.`);
  }

  if (workspaceRepo?.root) {
    lines.push(`Local git workspace: ${workspaceRepo.root}.`);
    if (workspaceRepo.branch) lines.push(`Current branch: ${workspaceRepo.branch}.`);
    if (workspaceRepo.remote) lines.push(`Git remote: ${workspaceRepo.remote}.`);
    if (workspaceRepo.status) lines.push(`Git status:\n${workspaceRepo.status}`);
    else lines.push('Git status: clean.');
    if (workspaceRepo.commits) lines.push(`Recent commits:\n${workspaceRepo.commits}`);
  }

  appendWorkspaceContext(lines, workspaceContext);

  return { role: 'system', content: lines.join('\n') };
}
