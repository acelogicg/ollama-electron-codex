import MessageContent from './MessageContent.jsx';

export default function MessageList({ messages, bottomRef }) {
  return (
    <section className="messages">
      {messages.map((message, index) => (
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
          </div>
        </article>
      ))}
      <div ref={bottomRef} />
    </section>
  );
}
