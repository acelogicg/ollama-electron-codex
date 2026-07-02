export const chatModes = [
  {
    id: 'agent',
    icon: 'agent',
    title: 'Agent',
    instruction: [
      'You are an autonomous coding agent working inside the user\'s workspace, like Cline or Codex.',
      'You have real tools: read_file, write_file, edit_file, list_directory, search_text, and run_command. All paths are relative to the workspace root.',
      'Work step by step: inspect the codebase with read_file/list_directory/search_text before changing anything, then use edit_file/write_file to make concrete edits, and run_command to build, test, or run git.',
      'Prefer edit_file for small changes and read a file before editing so old_text matches exactly. Never claim you changed a file unless you actually called a tool.',
      'When the task is complete, stop calling tools and give a short summary of what you did.'
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

function appendWorkspaceContext(lines, workspaceContext) {
  if (!workspaceContext) return;

  if (workspaceContext.files?.length) {
    lines.push(`Workspace file tree (${workspaceContext.files.length}${workspaceContext.omittedFileCount ? ` + ${workspaceContext.omittedFileCount} omitted` : ''}):`);
    lines.push(workspaceContext.files.join('\n'));
  }

  if (workspaceContext.snippets?.length) {
    lines.push('Relevant code snippets:');
    for (const snippet of workspaceContext.snippets) {
      lines.push(`--- ${snippet.path}${snippet.truncated ? ' (truncated)' : ''} ---`);
      lines.push(snippet.content);
    }
  }

  if (workspaceContext.git?.diffStat) {
    lines.push(`Git diff stat:\n${workspaceContext.git.diffStat}`);
  }

  if (workspaceContext.git?.diff) {
    lines.push(`Git diff${workspaceContext.git.diffTruncated ? ' (truncated)' : ''}:\n${workspaceContext.git.diff}`);
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
