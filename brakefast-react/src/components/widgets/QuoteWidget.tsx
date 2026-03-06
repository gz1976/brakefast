import type { DailyQuote } from '../../types';

interface Props {
  quote: DailyQuote;
}

export function QuoteWidget({ quote }: Props) {
  return (
    <div className="dash-widget">
      <div className="dash-label"><span className="icon">💬</span> Zitat des Tages</div>
      <p className="quote-text">"{quote.text}"</p>
      <p className="quote-author">— {quote.author}</p>
    </div>
  );
}
