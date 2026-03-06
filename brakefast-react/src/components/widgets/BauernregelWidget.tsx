import type { Bauernregel } from '../../types';

interface Props {
  bauernregel: Bauernregel;
}

export function BauernregelWidget({ bauernregel }: Props) {
  return (
    <div className="dash-widget">
      <div className="dash-label"><span className="icon">🌾</span> Bauernregel</div>
      <p className="quote-text">"{bauernregel.text}"</p>
      {bauernregel.meaning && <p className="quote-author">{bauernregel.meaning}</p>}
    </div>
  );
}
