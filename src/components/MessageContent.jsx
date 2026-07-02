import { formatDisplayText, getThinkingPreview, highlightCode, splitMessageBlocks } from '../utils/messageFormatting.jsx';

function TypingDots() {
  return <span className="typing"><b /><b /><b /></span>;
}

function ThinkingState({ thinking }) {
  return (
    <span className="thinking-state" title="Thinking" aria-label="Thinking">
      <span className="thinking-head">
        <span className="thinking-label">Thinking</span>
        <TypingDots />
      </span>
      {thinking ? <span className="thinking-preview">{getThinkingPreview(thinking)}</span> : null}
    </span>
  );
}

export default function MessageContent({ content, streaming, thinking, thinkingActive, role }) {
  if (!content && thinkingActive) return <ThinkingState thinking={thinking} />;
  if (!content) return streaming ? <TypingDots /> : '';

  return splitMessageBlocks(content).map((block, index) => {
    if (block.type === 'code') {
      return (
        <figure key={index} className="code-block">
          <figcaption>{block.language}</figcaption>
          <pre><code>{highlightCode(block.value)}</code></pre>
        </figure>
      );
    }

    const text = role === 'assistant' ? formatDisplayText(block.value) : block.value;
    return <span key={index} className="text-fragment">{text}</span>;
  });
}
