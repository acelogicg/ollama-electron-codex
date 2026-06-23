export const chatModes = [
  {
    id: 'ask',
    icon: 'ask',
    title: 'Ask',
    instruction: 'Answer directly and concisely. Ask for clarification only when needed.'
  },
  {
    id: 'agent',
    icon: 'agent',
    title: 'Agent',
    instruction: 'Act as an autonomous coding agent. Break down the task, make concrete progress, and report outcomes clearly.'
  },
  {
    id: 'skill',
    icon: 'skill',
    title: 'Skill',
    instruction: 'Focus on reusable skills, workflows, patterns, and step-by-step capability building.'
  },
  {
    id: 'plan',
    icon: 'plan',
    title: 'Plan',
    instruction: 'Think in plans first. Provide structured steps, risks, and sequencing before implementation details.'
  }
];

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
    'Use the provided workspace/codebase and git context when it is relevant. Do not claim to have changed files or run git write actions unless the user explicitly asks and the app exposes that action.'
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
