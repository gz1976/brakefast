import type { HistoryFact } from '../../types';

interface Props {
  history: HistoryFact;
}

export function HistoryWidget({ history }: Props) {
  return (
    <div className="dash-widget">
      <div className="dash-label"><span className="icon">📜</span> Heute in der Geschichte</div>
      <p className="history-year">{history.year}</p>
      <p className="history-text">{history.text}</p>
    </div>
  );
}
