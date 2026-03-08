import type { ModelStats } from '../../types';

interface Props {
  models: ModelStats[];
}

const TIER_COLORS: Record<string, string> = {
  'Tier 1': '#51cf66',
  'Tier 2': '#4dabf7',
  'Tier 3': '#9775fa',
};

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
            {models.map((m) => (
              <tr key={m.model}>
                <td className="model-name">{m.model}</td>
                <td>
                  <span
                    className="tier-badge"
                    style={{ color: TIER_COLORS[m.tier] || '#8a8a9e' }}
                  >
                    {m.tier}
                  </span>
                </td>
                <td>{m.calls}</td>
                <td>{m.avg_latency_ms > 0 ? `${(m.avg_latency_ms / 1000).toFixed(1)}s` : '—'}</td>
                <td>
                  <span className={m.success_rate >= 95 ? 'stat-good' : m.success_rate >= 80 ? 'stat-warn' : 'stat-bad'}>
                    {m.success_rate.toFixed(0)}%
                  </span>
                </td>
                <td>${m.estimated_cost_usd.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
