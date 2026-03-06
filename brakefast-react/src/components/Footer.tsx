interface Props {
  generated: string;
  editionNumber?: number;
}

export function Footer({ generated, editionNumber }: Props) {
  const dateObj = new Date(generated);
  const dateStr = dateObj.toLocaleDateString('de-AT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timeStr = dateObj.toLocaleTimeString('de-AT', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <footer className="footer">
      <div className="footer-logo">
        Brake<span>Fast</span>
      </div>
      <p className="footer-text">
        Kuratiert von Otto · Generiert am {dateStr} um {timeStr} Uhr · Powered by OpenClaw
      </p>
      {editionNumber && (
        <p className="footer-text">
          Voitsberg, Steiermark · Ausgabe №{editionNumber}
        </p>
      )}
    </footer>
  );
}
