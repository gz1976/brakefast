interface Props {
  date: string;
  totalArticles: number;
  editionNumber?: number;
  readingTimeTotal?: number;
}

export function Masthead({ date, totalArticles, editionNumber, readingTimeTotal }: Props) {
  const dateObj = new Date(date);
  const formattedDate = dateObj.toLocaleDateString('de-AT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <header className="masthead">
      <div className="masthead-location">Voitsberg, Steiermark</div>
      <div className="masthead-row">
        <div className="masthead-brand">
          <span className="masthead-dot"></span>
          <div>
            <div className="masthead-logo">BrakeFast</div>
            <div className="masthead-sub">Deine persönliche Morgenzeitung</div>
          </div>
        </div>
        <div className="masthead-chips">
          {editionNumber != null && (
            <span className="masthead-chip">Ausgabe #{editionNumber}</span>
          )}
          <span className="masthead-chip">{formattedDate}</span>
          <span className="masthead-chip">{totalArticles} Artikel</span>
          {readingTimeTotal != null && (
            <span className="masthead-chip">~{readingTimeTotal} Min. Lesezeit</span>
          )}
          <button
            className="masthead-chip masthead-reload"
            onClick={() => window.location.reload()}
            aria-label="Seite neu laden"
          >
            ↻ Neu laden
          </button>
        </div>
      </div>
    </header>
  );
}
