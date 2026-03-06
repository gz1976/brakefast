import type { VpsStatus } from '../../types';

interface Props {
  vps: VpsStatus;
}

export function VpsWidget({ vps }: Props) {
  return (
    <div className="dash-widget">
      <div className="dash-label"><span className="icon">🖥</span> Server Status</div>
      <div className="day-row">
        <span className="label">Disk</span>
        <span className="value">{vps.disk}</span>
      </div>
      <div className="day-row">
        <span className="label">Uptime</span>
        <span className="value">{vps.uptime}</span>
      </div>
      <div className="day-row">
        <span className="label">Container</span>
        <span className="value">{vps.containers}</span>
      </div>
      {vps.lastAudit && (
        <div className="day-row">
          <span className="label">Letztes Audit</span>
          <span className="value">{vps.lastAudit}</span>
        </div>
      )}
    </div>
  );
}
