import type { VpsStatus } from '../types';
import { SectionHeader } from './SectionHeader';

interface Props {
  vps: VpsStatus;
}

function getDiskColor(disk: string): string {
  const match = disk.match(/(\d+)/);
  if (!match) return 'sys-ok';
  const percent = parseInt(match[1], 10);
  if (percent >= 80) return 'sys-error';
  if (percent >= 60) return 'sys-warn';
  return 'sys-ok';
}

export function SystemStatus({ vps }: Props) {
  return (
    <>
      <SectionHeader id="system" icon="⚙️" title="System Status" />
      <div className="system-bar">
        <div className="sys-metric">
          <div className={`sys-value ${getDiskColor(vps.disk)}`}>
            {vps.disk.match(/(\d+%)/)?.[1] || vps.disk}
          </div>
          <div className="sys-label">Disk</div>
        </div>
        <div className="sys-metric">
          <div className="sys-value sys-ok">{vps.uptime}</div>
          <div className="sys-label">Uptime</div>
        </div>
        <div className="sys-metric">
          <div className="sys-value" style={{ color: 'var(--text-primary)' }}>{vps.containers}</div>
          <div className="sys-label">Container</div>
        </div>
        <div className="sys-metric">
          <div className="sys-value sys-ok">{vps.lastAudit ? '✓' : '–'}</div>
          <div className="sys-label">Letzter Audit</div>
        </div>
      </div>
    </>
  );
}
