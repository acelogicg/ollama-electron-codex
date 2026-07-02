const codeBlockPattern = /```([a-zA-Z0-9_+.-]*)\n?([\s\S]*?)```/g;
const tokenPattern = /(\/\/.*|#.*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:async|await|break|case|catch|class|const|continue|def|else|export|extends|finally|for|from|function|if|import|in|let|new|null|return|throw|try|var|while|true|false)\b|\b\d+(?:\.\d+)?\b)/g;

export function getThinkingPreview(thinking) {
  return thinking.replace(/\s+/g, ' ').trim().slice(-56);
}

export function splitMessageBlocks(content) {
  const blocks = [];
  let cursor = 0;

  for (const match of content.matchAll(codeBlockPattern)) {
    if (match.index > cursor) {
      blocks.push({ type: 'text', value: content.slice(cursor, match.index) });
    }

    blocks.push({
      type: 'code',
      language: match[1] || 'auto',
      value: match[2].replace(/\n$/, '')
    });
    cursor = match.index + match[0].length;
  }

  if (cursor < content.length) blocks.push({ type: 'text', value: content.slice(cursor) });

  return blocks;
}

export function formatDisplayText(text) {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^(\s*)[-*+]\s+/gm, '$1')
    .replace(/^(\s*)\d+\.\s+/gm, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\s+([:;,.!?])/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

export function highlightCode(code) {
  return code.split(tokenPattern).filter(Boolean).map((part, index) => {
    let className = 'code-token';

    if (/^(\/\/|#|\/\*)/.test(part)) className += ' comment';
    else if (/^["'`]/.test(part)) className += ' string';
    else if (/^\d/.test(part)) className += ' number';
    else if (/^(true|false|null)$/.test(part)) className += ' literal';
    else if (/^[a-zA-Z_]/.test(part)) className += ' keyword';

    return <span key={index} className={className}>{part}</span>;
  });
}
