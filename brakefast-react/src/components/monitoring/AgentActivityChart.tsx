import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { AgentActivity } from '../../types';

interface Props {
  data: AgentActivity[];
}

export function AgentActivityChart({ data }: Props) {
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
            <Bar dataKey="main" name="Main (Kimi)" fill="#4dabf7" radius={[4, 4, 0, 0]} />
            <Bar dataKey="worker" name="Worker (Gemini)" fill="#51cf66" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expert" name="Expert (Opus)" fill="#9775fa" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
