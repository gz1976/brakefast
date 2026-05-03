import { useState, useRef } from 'react';

interface Props {
  generated?: string;
  editionNumber?: number;
  clearAll?: () => void;
  readCount?: number;
  onToast?: (msg: string) => void;
}

export function Footer({ generated, editionNumber, clearAll, readCount, onToast }: Props) {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

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
    onToast?.('Lesehistorie gelöscht');
  };

  const dateObj = generated ? new Date(generated) : null;
  const dateStr = dateObj
    ? dateObj.toLocaleDateString('de-AT', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;
  const timeStr = dateObj
    ? dateObj.toLocaleTimeString('de-AT', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <footer className="footer">
      <div className="footer-logo">
        Brake<span>Fast</span>
      </div>
      <p className="footer-text">
        Kuratiert von Otto{dateStr && timeStr ? ` · Generiert am ${dateStr} um ${timeStr} Uhr` : ''} · Powered by OpenClaw
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
          aria-label="Alle gelesenen Artikel zurücksetzen"
        >
          {confirming ? 'Wirklich löschen?' : 'Lesehistorie löschen'}
        </button>
      )}
    </footer>
  );
}
