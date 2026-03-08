import type { MonitoringData } from '../../types';

interface Props {
  system: MonitoringData['system'];
  agents: MonitoringData['agents'];
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'active' || status === 'ok' || status === 'healthy'
    ? '#51cf66'
    : status === 'warning' ? '#ffd43b' : '#ff6b6b';
  return <span className="status-dot-monitor" style={{ background: color }} />;
}

function MetricCard({ label, value, status, detail }: {
  label: string;
  value: string | number;
  status?: 'ok' | 'warn' | 'error';
  detail?: string;
}) {
  const statusColor = status === 'error' ? '#ff6b6b' : status === 'warn' ? '#ffd43b' : '#51cf66';
  return (
    <div className="health-metric">
      <div className="health-metric-label">{label}</div>
      <div className="health-metric-value" style={status ? { color: statusColor } : undefined}>
        {value}
      </div>
      {detail && <div className="health-metric-detail">{detail}</div>}
    </div>
  );
}

export function SystemHealth({ system, agents }: Props) {
  const diskStatus = system.disk_percent >= 80 ? 'error' : system.disk_percent >= 60 ? 'warn' : 'ok';

  // Formatiere letzten Heartbeat
  const hbAge = system.last_heartbeat
    ? formatAge(system.last_heartbeat)
    : '—';

  return (
    <div className="monitor-card">
      <div className="monitor-card-header">
        <span className="monitor-card-icon">🖥️</span>
        <h3>System Health</h3>
      </div>

      {/* Agenten-Status */}
      <div className="agents-status">
        {Object.entries(agents).map(([id, agent]) => (
          <div key={id} className="agent-status-row">
            <StatusDot status={agent.status} />
            <span className="agent-id">{id}</span>
            <span className="agent-model">{agent.model}</span>
            <span className="agent-sessions">{agent.sessions_total} Sessions</span>
          </div>
        ))}
      </div>

      {/* System-Metriken */}
      <div className="health-metrics-grid">
        <MetricCard label="Disk" value={`${system.disk_percent}%`} status={diskStatus} />
        <MetricCard label="Uptime" value={system.uptime} status="ok" />
        <MetricCard label="Container" value={system.containers} />
        <MetricCard label="Heartbeat" value={hbAge} detail={system.heartbeat_status} />
        <MetricCard label="Letzter Audit" value={system.last_audit || '—'} />
      </div>
    </div>
  );
}

function formatAge(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Jetzt';
  if (mins < 60) return `vor ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours}h`;
  return `vor ${Math.floor(hours / 24)}d`;
}
