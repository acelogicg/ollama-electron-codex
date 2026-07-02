const BASE_TIPS = [
  'Jelaskan perubahan',
  'Jalankan test',
  'Cari bug',
  'Refactor kode'
];

const REPO_TIPS = [
  'Cek git status',
  'Buat pesan commit'
];

export default function MessageTips({ hasRepo, disabled, onSelect }) {
  const tips = hasRepo ? [...BASE_TIPS.slice(0, 3), ...REPO_TIPS] : BASE_TIPS;

  return (
    <div className="message-tips" aria-label="Saran lanjutan">
      <span className="tips-label">Tips</span>
      <div className="tips-chips">
        {tips.map((tip) => (
          <button
            key={tip}
            type="button"
            className="tip-chip"
            onClick={() => onSelect(tip)}
            disabled={disabled}
            title={tip}
          >
            {tip}
          </button>
        ))}
      </div>
    </div>
  );
}
