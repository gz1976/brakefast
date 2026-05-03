import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { MonitoringData, RoutingDecision } from '../../types';

interface Props {
  data: RoutingDecision[];
  agents?: MonitoringData['agents'];
}

const COLORS: Record<string, string> = {
  self: '#4dabf7',
  worker: '#51cf66',
  expert: '#9775fa',
};

function labelFor(agent: RoutingDecision['agent'], agents?: MonitoringData['agents']): string {
  const agentId = agent === 'self' ? 'main' : agent;
  const tier = agentId === 'main' ? 'Tier 2' : agentId === 'worker' ? 'Tier 1' : 'Tier 3';
  const label = agentId === 'main' ? 'Main' : agentId === 'worker' ? 'Worker' : 'Expert';
  const model = agents?.[agentId]?.model;
  return model ? `${label} (${tier}) · ${model}` : `${label} (${tier})`;
}

export function RoutingDistribution({ data, agents }: Props) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const displayData = data.filter((entry) => entry.count > 0);

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
                data={displayData}
                dataKey="count"
                nameKey="agent"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={3}
                strokeWidth={0}
              >
                {displayData.map((entry) => (
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
                  return [`${numVal} (${pct}%)`, labelFor(agent as RoutingDecision['agent'], agents)];
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
                <span className="routing-legend-label">{labelFor(entry.agent, agents)}</span>
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
