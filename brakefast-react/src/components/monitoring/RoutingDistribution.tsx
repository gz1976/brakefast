import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { RoutingDecision } from '../../types';

interface Props {
  data: RoutingDecision[];
}

const COLORS: Record<string, string> = {
  self: '#4dabf7',
  worker: '#51cf66',
  expert: '#9775fa',
};

const LABELS: Record<string, string> = {
  self: 'Main (Tier 2)',
  worker: 'Worker (Tier 1)',
  expert: 'Expert (Tier 3)',
};

export function RoutingDistribution({ data }: Props) {
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="monitor-card">
      <div className="monitor-card-header">
        <span className="monitor-card-icon">🔀</span>
        <h3>Routing-Verteilung</h3>
      </div>

      <div className="routing-content">
        <div className="routing-chart">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="agent"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={3}
                strokeWidth={0}
              >
                {data.map((entry) => (
                  <Cell key={entry.agent} fill={COLORS[entry.agent] || '#55556a'} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: '#161620',
                  border: '1px solid #232335',
                  borderRadius: '8px',
                  color: '#e8e8f0',
                  fontSize: '13px',
                }}
                formatter={(value, _name, props) => {
                  const numVal = Number(value);
                  const pct = total > 0 ? ((numVal / total) * 100).toFixed(1) : '0';
                  const agent = props?.payload?.agent as string;
                  return [`${numVal} (${pct}%)`, LABELS[agent] || agent];
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="routing-legend">
          {data.map((entry) => {
            const pct = total > 0 ? ((entry.count / total) * 100).toFixed(0) : '0';
            return (
              <div key={entry.agent} className="routing-legend-item">
                <span
                  className="routing-legend-dot"
                  style={{ background: COLORS[entry.agent] || '#55556a' }}
                />
                <span className="routing-legend-label">{LABELS[entry.agent] || entry.agent}</span>
                <span className="routing-legend-value">{entry.count} ({pct}%)</span>
              </div>
            );
          })}
          <div className="routing-legend-total">
            Gesamt: {total} Sessions
          </div>
        </div>
      </div>
    </div>
  );
}
