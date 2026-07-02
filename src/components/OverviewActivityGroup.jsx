import { ContentBlocks } from './MessageContent.jsx';

export default function OverviewActivityGroup({ items }) {
  return (
    <details className="overview-activity-group">
      <summary>
        <span className="overview-group-mark" />
        <span className="overview-group-title">Overview</span>
        <span className="overview-group-count">{items.length} tahap analisis</span>
      </summary>
      <div className="overview-group-items">
        {items.map((item, index) => (
          <details key={item.key || index} className="overview-group-item">
            <summary>
              <span>Tahap {index + 1}</span>
              <span className="overview-group-preview">
                {(item.content || item.thinking || 'Analisis').replace(/\s+/g, ' ').trim().slice(0, 72)}
              </span>
            </summary>
            <div className="overview-group-body">
              {item.thinking?.trim() ? (
                <div className="overview-group-section">
                  <span className="overview-label">Thinking</span>
                  <div className="overview-text">{item.thinking}</div>
                </div>
              ) : null}
              {item.content?.trim() ? (
                <div className="overview-group-section">
                  <span className="overview-label">Respons sementara</span>
                  <div className="overview-text">
                    <ContentBlocks content={item.content} role="assistant" />
                  </div>
                </div>
              ) : null}
            </div>
          </details>
        ))}
      </div>
    </details>
  );
}
