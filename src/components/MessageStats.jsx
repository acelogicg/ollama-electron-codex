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
      <span className="stat">{formatNumber(completionTokens)} token keluar</span>
      {promptTokens ? <span className="stat">{formatNumber(promptTokens)} token masuk</span> : null}
      {totalTokens ? <span className="stat">{formatNumber(totalTokens)} total</span> : null}
      <span className="stat">{seconds.toFixed(1)}s</span>
      {steps > 1 ? <span className="stat">{steps} langkah</span> : null}
    </div>
  );
}
