import type { NewspaperData } from '../types';
import { smartTruncate } from '../utils/textUtils';

interface Props {
  data: NewspaperData;
}

export function PersonalBoard({ data }: Props) {
  const calendar = data.widgets?.calendar || [];
  const calendarSummary = calendar.length > 0
    ? calendar.slice(0, 2).map(e => `${e.time} ${e.title}`).join(' · ')
    : 'Keine Termine heute';

  const focusTopics = data.focus_topics || [];
  const focusText = focusTopics.length > 0
    ? focusTopics.join(', ')
    : 'Themen des Tages priorisieren';

  const reminders = data.reminders || [];
  const reminderText = reminders.length > 0
    ? reminders.join(' · ')
    : calendarSummary;

  return (
    <div className="personal-board" id="personal">
      <div className="section-title-bar">
        <h2 className="section-title">Personal Board / Ottos Briefing</h2>
        <p className="section-subtitle">Persönlicher Einstieg, Tagesfokus und Kurator-Stimme aus deinem bestehenden Konzept</p>
      </div>

      <div className="personal-board-grid">
        <div className="personal-card">
          <div className="personal-card-title accent-amber">Ottos Briefing</div>
          <p className="personal-card-text">
            {data.editorial
              ? smartTruncate(data.editorial, 200)
              : 'Kurzer persönlicher Einstieg mit Einordnung des Tages'}
          </p>
        </div>

        <div className="personal-card">
          <div className="personal-card-title accent-amber">Fokus heute</div>
          <p className="personal-card-text">{focusText}</p>
        </div>

        <div className="personal-card">
          <div className="personal-card-title accent-amber">Nicht vergessen</div>
          <p className="personal-card-text">{reminderText}</p>
        </div>

        <div className="personal-card">
          <div className="personal-card-title accent-amber">Ton der Zeitung</div>
          <p className="personal-card-text">Rituell, persönlich und kuratiert — aber moderner, klarer und kürzer</p>
        </div>
      </div>
    </div>
  );
}
