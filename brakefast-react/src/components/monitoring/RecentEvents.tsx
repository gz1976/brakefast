import type { MonitoringData } from '../../types';

interface Props {
  events: MonitoringData['recent_events'];
}

const TYPE_COLORS: Record<string, string> = {
  routing: '#4dabf7',
  heartbeat: '#51cf66',
  error: '#ff6b6b',
  cron: '#e8943a',
  escalation: '#9775fa',
  telegram: '#22b8cf',
};

export function RecentEvents({ events }: Props) {
  return (
    <div className="monitor-card">
      <div className="monitor-card-header">
        <span className="monitor-card-icon">📋</span>
        <h3>Letzte Ereignisse</h3>
      </div>

      <div className="events-list">
        {events.length === 0 ? (
          <div className="events-empty">Keine Ereignisse vorhanden</div>
        ) : (
          events.map((event, i) => (
            <div key={i} className="event-row">
              <span className="event-time">
                {new Date(event.timestamp).toLocaleTimeString('de-AT', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <span
                className="event-type-badge"
                style={{ color: TYPE_COLORS[event.type] || '#8a8a9e' }}
              >
                {event.type}
              </span>
              <span className="event-agent">{event.agent}</span>
              <span className="event-summary">{event.summary}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
