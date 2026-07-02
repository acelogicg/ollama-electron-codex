import MessageContent from './MessageContent.jsx';
import MessageStats from './MessageStats.jsx';
import ToolMessage from './ToolMessage.jsx';

export default function MessageList({ messages, bottomRef }) {
  return (
    <section className="messages">
      {messages.map((message, index) => (
        message.role === 'tool'
          ? (
            <article key={index} className="message-row tool">
              <ToolMessage
                name={message.name}
                args={message.args}
                result={message.result}
                status={message.status}
              />
            </article>
          )
          : (
            <article key={index} className={`message-row ${message.role} ${message.thinkingActive ? 'thinking' : ''}`}>
              <div className="bubble">
                <div className="content">
                  <MessageContent
                    role={message.role}
                    content={message.content}
                    streaming={message.streaming}
                    thinking={message.thinking || ''}
                    thinkingActive={message.thinkingActive}
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
