import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { AgentActivity, MonitoringData } from '../../types';

interface Props {
  data: AgentActivity[];
  agents?: MonitoringData['agents'];
}

type AgentId = 'main' | 'worker' | 'expert';

function agentLabel(id: AgentId, agents?: MonitoringData['agents']): string {
  const model = agents?.[id]?.model;
  const tier = id === 'main' ? 'Tier 2' : id === 'worker' ? 'Tier 1' : 'Tier 3';
  const label = id === 'main' ? 'Main' : id === 'worker' ? 'Worker' : 'Expert';
  return model ? `${label} (${tier}) · ${model}` : `${label} (${tier})`;
}

export function AgentActivityChart({ data, agents }: Props) {
  // Formatiere Datum fuer X-Achse (nur Tag)
  const chartData = data.map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString('de-AT', { weekday: 'short', day: 'numeric' }),
  }));

  return (
    <div className="monitor-card">
      <div className="monitor-card-header">
        <span className="monitor-card-icon">📊</span>
        <h3>Agent-Aktivitaet (7 Tage)</h3>
      </div>
      <div className="monitor-chart-container">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#232335" />
            <XAxis dataKey="label" stroke="#55556a" fontSize={12} />
            <YAxis stroke="#55556a" fontSize={12} />
            <Tooltip
              contentStyle={{
                background: '#161620',
                border: '1px solid #232335',
                borderRadius: '8px',
                color: '#e8e8f0',
                fontSize: '13px',
              }}
            />
            <Legend wrapperStyle={{ fontSize: '12px', color: '#8a8a9e' }} />
            <Bar dataKey="main" name={agentLabel('main', agents)} fill="#4dabf7" radius={[4, 4, 0, 0]} />
            <Bar dataKey="worker" name={agentLabel('worker', agents)} fill="#51cf66" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expert" name={agentLabel('expert', agents)} fill="#9775fa" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
