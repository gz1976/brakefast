import { useMemo } from 'react';
import type { Widgets } from '../types';
import { WeatherWidget } from './widgets/WeatherWidget';
import { DayInfoWidget } from './widgets/DayInfoWidget';
import { CalendarWidget } from './widgets/CalendarWidget';
import { QuoteWidget } from './widgets/QuoteWidget';
import { HistoryWidget } from './widgets/HistoryWidget';
import { BauernregelWidget } from './widgets/BauernregelWidget';
import { PollenWidget } from './widgets/PollenWidget';
import { VpsWidget } from './widgets/VpsWidget';

interface Props {
  widgets: Widgets;
}

function getRotatingWidget(widgets: Widgets): React.ReactNode {
  const candidates: React.ReactNode[] = [];

  if (widgets.quote) candidates.push(<QuoteWidget key="quote" quote={widgets.quote} />);
  if (widgets.history) candidates.push(<HistoryWidget key="history" history={widgets.history} />);
  if (widgets.bauernregel) candidates.push(<BauernregelWidget key="bauernregel" bauernregel={widgets.bauernregel} />);
  if (widgets.vps) candidates.push(<VpsWidget key="vps" vps={widgets.vps} />);
  if (widgets.pollen) candidates.push(<PollenWidget key="pollen" pollen={widgets.pollen} />);

  if (candidates.length === 0) return null;

  // Rotate based on day of year
  const now = new Date();
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
  return candidates[dayOfYear % candidates.length];
}

export function DashboardBar({ widgets }: Props) {
  const rotatingWidget = useMemo(() => getRotatingWidget(widgets), [widgets]);

  return (
    <div className="dashboard-bar">
      {widgets.weather && <WeatherWidget weather={widgets.weather} />}
      {widgets.dayInfo && <DayInfoWidget dayInfo={widgets.dayInfo} />}
      <CalendarWidget events={widgets.calendar || []} />
      {rotatingWidget}
    </div>
  );
}
