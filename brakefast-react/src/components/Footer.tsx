import { useState, useRef } from 'react';

interface Props {
  generated: string;
  editionNumber?: number;
  clearAll?: () => void;
  readCount?: number;
  onToast?: (msg: string) => void;
}

export function Footer({ generated, editionNumber, clearAll, readCount, onToast }: Props) {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleClear = () => {
    if (!clearAll) return;
    if (!confirming) {
      setConfirming(true);
      timerRef.current = setTimeout(() => setConfirming(false), 3000);
      return;
    }
    clearTimeout(timerRef.current);
    setConfirming(false);
    clearAll();
    onToast?.('Lesehistorie geloescht');
  };

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
      {clearAll && readCount !== undefined && readCount > 0 && (
        <button
          className="footer-clear-history"
          onClick={handleClear}
          aria-label="Alle gelesenen Artikel zuruecksetzen"
        >
          {confirming ? 'Wirklich loeschen?' : 'Lesehistorie loeschen'}
        </button>
      )}
    </footer>
  );
}
