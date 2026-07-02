import { formatDisplayText, highlightCode, splitMessageBlocks } from '../utils/messageFormatting.jsx';

function TypingDots() {
  return <span className="typing"><b /><b /><b /></span>;
}

export function ContentBlocks({ content, role }) {
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

export default function MessageContent({
  content,
  streaming,
  thinking,
  thinkingActive,
  intermediate,
  role
}) {
  if (role !== 'assistant') {
    if (!content) return streaming ? <TypingDots /> : '';
    return <ContentBlocks content={content} role={role} />;
  }

  const hasThinking = Boolean(thinking?.trim());
  const showOverview = streaming || intermediate || hasThinking;
  const contentBelongsToOverview = streaming || intermediate;
  const overviewTitle = streaming && (thinkingActive || (!content && !hasThinking))
    ? 'Thinking'
    : 'Overview';

  return (
    <>
      {showOverview ? (
        <details className="response-overview" open={streaming}>
          <summary>
            <span>{overviewTitle}</span>
            {streaming ? <TypingDots /> : null}
          </summary>
          {hasThinking || (contentBelongsToOverview && content) ? <div className="overview-body">
            {hasThinking ? (
              <div className="overview-section">
                <span className="overview-label">Thinking</span>
                <div className="overview-text">{thinking}</div>
              </div>
            ) : null}
            {contentBelongsToOverview && content ? (
              <div className="overview-section">
                {hasThinking ? <span className="overview-label">Respons sementara</span> : null}
                <div className="overview-text">
                  <ContentBlocks content={content} role={role} />
                </div>
              </div>
            ) : null}
          </div> : null}
        </details>
      ) : null}
      {!contentBelongsToOverview && content
        ? <ContentBlocks content={content} role={role} />
        : null}
    </>
  );
}
