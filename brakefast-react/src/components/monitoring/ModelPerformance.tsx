import type { ModelStats } from '../../types';

interface Props {
  models: ModelStats[];
}

const TIER_COLORS: Record<string, string> = {
  'Tier 1': '#51cf66',
  'Tier 2': '#4dabf7',
  'Tier 3': '#9775fa',
};

function latencyLabel(ms: number): string {
  return ms > 0 ? `${(ms / 1000).toFixed(1)}s` : 'n/a';
}

function successLabel(calls: number, rate: number): { text: string; className: string } {
  if (calls <= 0) return { text: 'n/a', className: 'stat-muted' };
  if (rate >= 95) return { text: `${rate.toFixed(0)}%`, className: 'stat-good' };
  if (rate >= 80) return { text: `${rate.toFixed(0)}%`, className: 'stat-warn' };
  return { text: `${rate.toFixed(0)}%`, className: 'stat-bad' };
}

export function ModelPerformance({ models }: Props) {
  return (
    <div className="monitor-card">
      <div className="monitor-card-header">
        <span className="monitor-card-icon">🤖</span>
        <h3>Modell-Performance</h3>
      </div>

      <div className="model-table-container">
        <table className="model-table">
          <thead>
            <tr>
              <th>Modell</th>
              <th>Tier</th>
              <th>Calls</th>
              <th>Latenz</th>
              <th>Erfolg</th>
              <th>Kosten</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => {
              const success = successLabel(m.calls, m.success_rate);
              return (
                <tr key={m.model}>
                  <td className="model-name">{m.model || 'Unbekanntes Modell'}</td>
                  <td>
                    <span
                      className="tier-badge"
                      style={{ color: TIER_COLORS[m.tier] || '#8a8a9e' }}
                    >
                      {m.tier || 'n/a'}
                    </span>
                  </td>
                  <td>{m.calls}</td>
                  <td>{latencyLabel(m.avg_latency_ms)}</td>
                  <td>
                    <span className={success.className}>
                      {success.text}
                    </span>
                  </td>
                  <td>${m.estimated_cost_usd.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
