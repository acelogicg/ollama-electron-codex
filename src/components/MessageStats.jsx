import Icon from './Icon.jsx';

function formatNumber(value) {
  return Number.isFinite(value) ? Math.round(value).toLocaleString('id-ID') : '0';
}

export default function MessageStats({ stats }) {
  if (!stats) return null;
  const { tokensPerSecond, completionTokens, promptTokens, totalTokens, elapsedMs, steps } = stats;
  const seconds = (elapsedMs || 0) / 1000;

  return (
    <div className="message-stats" title="Statistik generasi LM Studio">
      <span className="stat tps">
        <Icon name="circle" />
        {(tokensPerSecond || 0).toFixed(1)} tok/s
      </span>
      <span className="stat out" title="Token keluar (completion)">
        <Icon name="circle" />
        {formatNumber(completionTokens)}
      </span>
      {promptTokens ? (
        <span className="stat in" title="Token masuk (prompt)">
          <Icon name="circle" />
          {formatNumber(promptTokens)}
        </span>
      ) : null}
      {totalTokens ? (
        <span className="stat total" title="Total token">
          <Icon name="circle" />
          {formatNumber(totalTokens)}
        </span>
      ) : null}
      <span className="stat time">
        <Icon name="circle" />
        {seconds.toFixed(1)}s
      </span>
      {steps > 1 ? (
        <span className="stat steps">
          <Icon name="circle" />
          {steps} langkah
        </span>
      ) : null}
    </div>
  );
}
