import type { DayInfo } from '../../types';

interface Props {
  dayInfo: DayInfo;
}

function getSunProgress(sunrise: string, sunset: string): number {
  const now = new Date();
  const [riseH, riseM] = sunrise.split(':').map(Number);
  const [setH, setM] = sunset.split(':').map(Number);
  const riseMinutes = riseH * 60 + riseM;
  const setMinutes = setH * 60 + setM;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  if (nowMinutes <= riseMinutes) return 0;
  if (nowMinutes >= setMinutes) return 100;
  return Math.round(((nowMinutes - riseMinutes) / (setMinutes - riseMinutes)) * 100);
}

export function DayInfoWidget({ dayInfo }: Props) {
  const progress = getSunProgress(dayInfo.sunrise, dayInfo.sunset);

  return (
    <div className="dash-widget">
      <div className="dash-label"><span className="icon">☀️</span> Tagesinfo</div>
      <div className="day-row">
        <span className="label">Sonnenaufgang</span>
        <span className="value">{dayInfo.sunrise}</span>
      </div>
      <div className="day-row">
        <span className="label">Sonnenuntergang</span>
        <span className="value">{dayInfo.sunset}</span>
      </div>
      {dayInfo.dayLength && (
        <div className="day-row">
          <span className="label">Tageslänge</span>
          <span className="value">{dayInfo.dayLength}</span>
        </div>
      )}
      {dayInfo.namenstag && (
        <div className="day-row">
          <span className="label">Namenstag</span>
          <span className="value" style={{ color: 'var(--accent)' }}>{dayInfo.namenstag}</span>
        </div>
      )}
      <div className="sun-bar">
        <div className="sun-bar-fill" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
