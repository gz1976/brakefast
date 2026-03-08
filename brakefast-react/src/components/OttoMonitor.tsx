import { useMonitoring } from '../hooks/useMonitoring';
import { AgentActivityChart } from './monitoring/AgentActivityChart';
import { CostTracker } from './monitoring/CostTracker';
import { RoutingDistribution } from './monitoring/RoutingDistribution';
import { ModelPerformance } from './monitoring/ModelPerformance';
import { SystemHealth } from './monitoring/SystemHealth';
import { RecentEvents } from './monitoring/RecentEvents';

export function OttoMonitor() {
  const { data, loading, error } = useMonitoring();

  if (loading) {
    return (
      <div className="loading-screen">
        <h1>Otto <span>Monitor</span></h1>
        <p>Lade Monitoring-Daten&hellip;</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="loading-screen">
        <h1>Otto <span>Monitor</span></h1>
        <p>Fehler beim Laden: {error || 'Keine Daten'}</p>
        <p style={{ fontSize: '12px', marginTop: '8px', color: '#55556a' }}>
          Monitoring-Daten werden vom VPS generiert. Starte das Pipeline-Script auf dem Server.
        </p>
      </div>
    );
  }

  const generatedDate = new Date(data.generated);
  const dateStr = generatedDate.toLocaleDateString('de-AT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timeStr = generatedDate.toLocaleTimeString('de-AT', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="monitor-container">
      {/* Header */}
      <div className="monitor-header">
        <div className="monitor-header-left">
          <h1 className="monitor-title">Otto <span>Monitor</span></h1>
          <p className="monitor-subtitle">Multi-Model Routing Dashboard</p>
        </div>
        <div className="monitor-header-right">
          <span className="monitor-updated">
            Aktualisiert: {dateStr}, {timeStr}
          </span>
          <span className="monitor-period">{data.period}</span>
        </div>
      </div>

      {/* Grid-Layout */}
      <div className="monitor-grid">
        {/* Zeile 1: System Health (volle Breite) */}
        <div className="monitor-grid-full">
          <SystemHealth system={data.system} agents={data.agents} />
        </div>

        {/* Zeile 2: Aktivitaet + Routing */}
        <div className="monitor-grid-wide">
          <AgentActivityChart data={data.activity_7d} />
        </div>
        <div className="monitor-grid-narrow">
          <RoutingDistribution data={data.routing} />
        </div>

        {/* Zeile 3: Kosten + Modell-Performance */}
        <div className="monitor-grid-half">
          <CostTracker costs={data.costs} />
        </div>
        <div className="monitor-grid-half">
          <ModelPerformance models={data.models} />
        </div>

        {/* Zeile 4: Letzte Ereignisse */}
        <div className="monitor-grid-full">
          <RecentEvents events={data.recent_events} />
        </div>
      </div>

      {/* Footer */}
      <div className="monitor-footer">
        <span>Otto Monitor · Powered by OpenClaw · 3-Tier Multi-Model Routing</span>
      </div>
    </div>
  );
}
