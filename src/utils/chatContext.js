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

export function buildSystemContext(modeId, githubRepo) {
  const mode = chatModes.find((item) => item.id === modeId) || chatModes[0];
  const lines = [
    `Mode: ${mode.title}.`,
    mode.instruction
  ];

  if (githubRepo?.nameWithOwner) {
    lines.push(`GitHub repository context: ${githubRepo.nameWithOwner}.`);
    if (githubRepo.url) lines.push(`Repository URL: ${githubRepo.url}.`);
    if (githubRepo.description) lines.push(`Repository description: ${githubRepo.description}.`);
  }

  return { role: 'system', content: lines.join('\n') };
}
