import type { MarketsData } from '../types';

interface Props {
  markets?: MarketsData;
}

const FALLBACK_INDICES = [
  { symbol: 'DAX', label: 'DAX', value: '—', change: '—' },
  { symbol: 'NASDAQ', label: 'NASDAQ FUT.', value: '—', change: '—' },
  { symbol: 'BTC', label: 'BTC', value: '—', change: '—' },
  { symbol: 'EURUSD', label: 'EUR/USD', value: '—', change: '—' },
  { symbol: 'GOLD', label: 'GOLD', value: '—', change: '—' },
  { symbol: 'VIX', label: 'VIX', value: '—', change: '—' },
];

function getChangeClass(change: string): string {
  if (change.startsWith('+')) return 'change-positive';
  if (change.startsWith('-')) return 'change-negative';
  return 'change-neutral';
}

export function MarketsSection({ markets }: Props) {
  const indices = markets?.indices || FALLBACK_INDICES;
  const insights = markets?.insights || [];
  const updated = markets?.updated || '';

  return (
    <div className="markets-section" id="maerkte">
      <div className="section-title-bar">
        <h2 className="section-title">Märkte</h2>
        <p className="section-subtitle">Neu ergänzt, damit deine Zeitung noch persönlicher und nützlicher wird</p>
        {updated && <span className="section-timestamp">Aktualisiert {updated}</span>}
      </div>

      <div className="markets-grid">
        {indices.map((idx) => (
          <div key={idx.symbol} className="market-card">
            <div className="market-card-label">{idx.label}</div>
            <div className={`market-card-value ${getChangeClass(idx.change)}`}>
              {idx.change !== '—' ? idx.change : idx.value}
            </div>
            {idx.value !== '—' && idx.change !== '—' && (
              <div className="market-card-price">{idx.value}</div>
            )}
          </div>
        ))}
      </div>

      {insights.length > 0 && (
        <div className="markets-insights">
          {insights.map((insight, i) => (
            <div key={i} className="market-insight-card">
              {insight.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
