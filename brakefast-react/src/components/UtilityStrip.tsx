import { useState, useEffect } from 'react';
import type { Widgets } from '../types';

interface Props {
  widgets: Widgets;
}

interface RotatingCard {
  label: string;
  value: string;
  detail: string;
  isQuote?: boolean;
}

export function UtilityStrip({ widgets }: Props) {
  const weather = widgets.weather;
  const dayInfo = widgets.dayInfo;
  const calendar = widgets.calendar || [];
  const quote = widgets.quote;

  // Build the rotating cards pool
  const rotatingCards: RotatingCard[] = [];

  if (quote) {
    rotatingCards.push({
      label: 'Zitat des Tages',
      value: quote.text,
      detail: quote.author,
      isQuote: true,
    });
  }

  rotatingCards.push({
    label: 'Heute beachten',
    value: 'Fokus priorisieren',
    detail: 'Nicht verzetteln',
  });

  const [rotatingIndex, setRotatingIndex] = useState(0);

  useEffect(() => {
    if (rotatingCards.length <= 1) return;
    const interval = setInterval(() => {
      setRotatingIndex((prev) => (prev + 1) % rotatingCards.length);
    }, 12000); // Rotate every 12 seconds
    return () => clearInterval(interval);
  }, [rotatingCards.length]);

  const currentRotating = rotatingCards[rotatingIndex % rotatingCards.length];

  return (
    <section className="utility-strip">
      <div className="utility-card">
        <div className="utility-card-label">Wetter Voitsberg</div>
        <div className="utility-card-value">{weather ? `+${weather.temp}°` : '—'}</div>
        <div className="utility-card-detail">
          {weather ? weather.description : 'Keine Daten'}
        </div>
      </div>

      <div className="utility-card">
        <div className="utility-card-label">Tagesinfo</div>
        <div className="utility-card-value">
          {dayInfo ? `Sonnenaufgang ${dayInfo.sunrise}` : '—'}
        </div>
        <div className="utility-card-detail">
          {dayInfo
            ? `Tageslänge ${dayInfo.dayLength || '—'} · ${dayInfo.namenstag || ''}`
            : 'Keine Daten'}
        </div>
      </div>

      <div className="utility-card">
        <div className="utility-card-label">Termine heute</div>
        <div className="utility-card-value">
          {calendar.length > 0
            ? `${calendar.length} Termine`
            : 'Keine fixen Termine'}
        </div>
        <div className="utility-card-detail">
          {calendar.length > 0
            ? `${calendar[0].time} ${calendar[0].title}`
            : 'Freier Tag'}
        </div>
      </div>

      <div className="utility-card utility-card-rotating">
        <div className="utility-card-label">{currentRotating?.label}</div>
        {currentRotating?.isQuote ? (
          <>
            <div className="utility-card-quote">{currentRotating.value}</div>
            <div className="utility-card-detail">{currentRotating.detail}</div>
          </>
        ) : (
          <>
            <div className="utility-card-value">{currentRotating?.value}</div>
            <div className="utility-card-detail">{currentRotating?.detail}</div>
          </>
        )}
      </div>
    </section>
  );
}
