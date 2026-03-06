import type { PollenData } from '../../types';

interface Props {
  pollen: PollenData;
}

const LEVEL_COLORS: Record<string, string> = {
  niedrig: 'var(--accent-green)',
  mittel: 'var(--accent)',
  hoch: '#e74c3c',
};

export function PollenWidget({ pollen }: Props) {
  const color = LEVEL_COLORS[pollen.level.toLowerCase()] || 'var(--text-dim)';

  return (
    <div className="dash-widget">
      <div className="dash-label"><span className="icon">🌿</span> Pollenflug</div>
      <p className="pollen-level" style={{ color, fontWeight: 700, fontSize: '1.1rem' }}>
        Belastung: {pollen.level}
      </p>
      {pollen.types.length > 0 && (
        <p className="pollen-types" style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
          {pollen.types.join(', ')}
        </p>
      )}
      <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: '0.3rem' }}>
        {pollen.description}
      </p>
    </div>
  );
}
