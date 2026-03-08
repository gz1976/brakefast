import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { MonitoringData } from '../../types';

interface Props {
  costs: MonitoringData['costs'];
}

function BudgetMeter({ label, current, limit }: { label: string; current: number; limit: number }) {
  const percent = Math.min((current / limit) * 100, 100);
  const color = percent >= 100 ? '#ff6b6b' : percent >= 80 ? '#ffd43b' : '#51cf66';

  return (
    <div className="budget-meter">
      <div className="budget-meter-header">
        <span className="budget-meter-label">{label}</span>
        <span className="budget-meter-value" style={{ color }}>
          ${current.toFixed(2)} / ${limit.toFixed(0)}
        </span>
      </div>
      <div className="budget-meter-track">
        <div
          className="budget-meter-fill"
          style={{ width: `${percent}%`, background: color }}
        />
      </div>
    </div>
  );
}

export function CostTracker({ costs }: Props) {
  const chartData = costs.history_7d.map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString('de-AT', { weekday: 'short', day: 'numeric' }),
  }));

  return (
    <div className="monitor-card">
      <div className="monitor-card-header">
        <span className="monitor-card-icon">💰</span>
        <h3>Kosten-Tracking</h3>
      </div>

      <div className="budget-meters">
        <BudgetMeter label="Heute" current={costs.today_usd} limit={costs.daily_limit_usd} />
        <BudgetMeter label="Monat" current={costs.month_usd} limit={costs.monthly_limit_usd} />
      </div>

      <div className="monitor-chart-container">
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#232335" />
            <XAxis dataKey="label" stroke="#55556a" fontSize={12} />
            <YAxis stroke="#55556a" fontSize={12} tickFormatter={(v) => `$${v}`} />
            <Tooltip
              contentStyle={{
                background: '#161620',
                border: '1px solid #232335',
                borderRadius: '8px',
                color: '#e8e8f0',
                fontSize: '13px',
              }}
              formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Kosten']}
            />
            <Area
              type="monotone"
              dataKey="total_usd"
              name="Tageskosten"
              stroke="#e8943a"
              fill="#e8943a"
              fillOpacity={0.15}
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
