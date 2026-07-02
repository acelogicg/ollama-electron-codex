import Icon from './Icon.jsx';

const BADGES = [
  { key: 'tools', icon: 'tools', label: 'Tools / function calling' },
  { key: 'thinking', icon: 'thinking', label: 'Thinking / reasoning' },
  { key: 'vision', icon: 'vision', label: 'Vision (gambar)' },
  { key: 'embedding', icon: 'embedding', label: 'Embedding' }
];

export default function ModelBadges({ capabilities, className = '' }) {
  if (!capabilities) return null;
  const active = BADGES.filter((badge) => capabilities[badge.key]);
  if (!active.length) return null;

  return (
    <span className={`model-badges ${className}`}>
      {active.map((badge) => (
        <span key={badge.key} className={`model-badge ${badge.key}`} title={badge.label} aria-label={badge.label}>
          <Icon name={badge.icon} />
        </span>
      ))}
    </span>
  );
}
