import type { CalendarEvent } from '../../types';

interface Props {
  events: CalendarEvent[];
}

export function CalendarWidget({ events }: Props) {
  return (
    <div className="dash-widget">
      <div className="dash-label"><span className="icon">📅</span> Termine heute</div>
      {events.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Keine Termine</p>
      ) : (
        events.slice(0, 5).map((ev, i) => (
          <div key={i} className="cal-event">
            <span className="cal-time">{ev.time}</span>
            <span className="cal-title">{ev.title}</span>
          </div>
        ))
      )}
    </div>
  );
}
