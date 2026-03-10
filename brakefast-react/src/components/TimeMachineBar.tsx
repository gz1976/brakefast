import type { ArchiveEdition } from '../types';

interface Props {
  archiveEditions: ArchiveEdition[];
  selectedEdition: string | null;
  onGoToLatest: () => void;
  onGoToEdition: (edition: string) => void;
}

export function TimeMachineBar({
  archiveEditions,
  selectedEdition,
  onGoToLatest,
  onGoToEdition,
}: Props) {
  if (archiveEditions.length === 0) return null;

  const currentIndex = selectedEdition
    ? archiveEditions.findIndex((edition) => edition.date === selectedEdition)
    : -1;
  const previousEdition = currentIndex >= 0
    ? archiveEditions[currentIndex + 1]
    : (archiveEditions[1] || archiveEditions[0]);

  return (
    <div className="time-machine-bar">
      <div className="time-machine-copy">
        <span className="time-machine-label">TimeMachine</span>
        <span className="time-machine-current">
          {selectedEdition ? `Ausgabe ${selectedEdition}` : 'Aktuelle Ausgabe'}
        </span>
      </div>

      <div className="time-machine-actions">
        <button
          className="time-machine-button"
          type="button"
          onClick={onGoToLatest}
          disabled={!selectedEdition}
        >
          Heute
        </button>

        <button
          className="time-machine-button"
          type="button"
          onClick={() => previousEdition && onGoToEdition(previousEdition.date)}
          disabled={!previousEdition}
        >
          Vorige Ausgabe
        </button>

        <label className="time-machine-select-wrap">
          <span className="sr-only">Archiv-Ausgabe wählen</span>
          <select
            className="time-machine-select"
            value={selectedEdition || ''}
            onChange={(event) => {
              const value = event.target.value;
              if (!value) {
                onGoToLatest();
                return;
              }
              onGoToEdition(value);
            }}
          >
            <option value="">Aktuelle Ausgabe</option>
            {archiveEditions.map((edition) => (
              <option key={edition.date} value={edition.date}>
                {edition.display_date}
                {edition.edition_number ? ` · #${edition.edition_number}` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
