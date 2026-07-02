import MessageContent from './MessageContent.jsx';
import MessageStats from './MessageStats.jsx';
import OverviewActivityGroup from './OverviewActivityGroup.jsx';
import ToolActivityGroup from './ToolActivityGroup.jsx';
import ToolMessage from './ToolMessage.jsx';

const READ_TOOLS = new Set(['read_file', 'list_directory', 'search_text']);
const OVERVIEW_GROUP_THRESHOLD = 3;

function groupIntermediateOverviews(messages) {
  const overviewByTurn = new Map();
  let turn = -1;

  messages.forEach((message, index) => {
    if (message.role === 'user') turn += 1;
    if (message.role === 'assistant' && message.intermediate) {
      const items = overviewByTurn.get(turn) || [];
      items.push({ ...message, key: `overview-step-${turn}-${index}` });
      overviewByTurn.set(turn, items);
    }
  });

  const insertedTurns = new Set();
  turn = -1;
  return messages.flatMap((message) => {
    if (message.role === 'user') turn += 1;
    if (message.role !== 'assistant' || !message.intermediate) return [message];

    const items = overviewByTurn.get(turn) || [];
    if (items.length < OVERVIEW_GROUP_THRESHOLD) return [message];
    if (insertedTurns.has(turn)) return [];
    insertedTurns.add(turn);
    return [{ role: 'overview-group', items, key: `overview-group-${turn}` }];
  });
}

function groupReadActivity(messages) {
  const grouped = [];
  let activeGroup = null;

  messages.forEach((message, index) => {
    if (message.role === 'tool' && READ_TOOLS.has(message.name)) {
      if (!activeGroup) {
        activeGroup = { role: 'read-group', items: [], key: `reads-${message.toolId || index}` };
        grouped.push(activeGroup);
      }
      activeGroup.items.push(message);
      return;
    }

    grouped.push({ ...message, key: message.toolId || `message-${index}` });
    const intermediateAssistant = message.role === 'assistant'
      && (message.intermediate || message.streaming);
    if (message.role === 'user' || message.role === 'tool' || !intermediateAssistant) {
      activeGroup = null;
    }
  });

  return grouped.flatMap((item) => (
    item.role === 'read-group' && item.items.length === 1
      ? [{ ...item.items[0], key: item.key }]
      : [item]
  ));
}

export default function MessageList({ messages, bottomRef, containerRef, onScroll }) {
  const displayMessages = groupReadActivity(groupIntermediateOverviews(messages));

  return (
    <section className="messages" ref={containerRef} onScroll={onScroll}>
      {displayMessages.map((message) => (
        message.role === 'overview-group'
          ? (
            <article key={message.key} className="message-row assistant overview-group-row">
              <OverviewActivityGroup items={message.items} />
            </article>
          )
          : message.role === 'read-group'
          ? (
            <article key={message.key} className="message-row tool">
              <ToolActivityGroup items={message.items} />
            </article>
          )
          : message.role === 'tool'
          ? (
            <article key={message.key} className="message-row tool">
              <ToolMessage
                name={message.name}
                args={message.args}
                result={message.result}
                status={message.status}
              />
            </article>
          )
          : (
            <article key={message.key} className={`message-row ${message.role}`}>
              <div className="bubble">
                <div className="content">
                  <MessageContent
                    role={message.role}
                    content={message.content}
                    streaming={message.streaming}
                    thinking={message.thinking || ''}
                    thinkingActive={message.thinkingActive}
                    intermediate={message.intermediate}
                  />
                </div>
                {message.role === 'assistant' && !message.streaming && message.stats
                  ? <MessageStats stats={message.stats} />
                  : null}
              </div>
            </article>
          )
      ))}
      <div ref={bottomRef} />
    </section>
  );
}
