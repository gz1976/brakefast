import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TimeMachineBar } from './TimeMachineBar';
import type { ArchiveEdition } from '../types';

function createEdition(date: string): ArchiveEdition {
  return {
    date,
    display_date: date,
    year: date.slice(0, 4),
    month: date.slice(5, 7),
    day: date.slice(8, 10),
    data_url: `/archive/${date}.json`,
  };
}

const editions: ArchiveEdition[] = [
  createEdition('2026-03-28'),
  createEdition('2026-03-27'),
  createEdition('2026-03-26'),
];

const defaultProps = {
  archiveEditions: editions,
  selectedEdition: null as string | null,
  onGoToLatest: vi.fn(),
  onGoToEdition: vi.fn(),
};

describe('TimeMachineBar', () => {
  it('returns null with empty editions', () => {
    const { container } = render(
      <TimeMachineBar
        {...defaultProps}
        archiveEditions={[]}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders Heute button disabled when no selection', () => {
    render(<TimeMachineBar {...defaultProps} selectedEdition={null} />);
    const btn = screen.getByRole('button', { name: 'Heute' });
    expect(btn).toBeDisabled();
  });

  it('renders Vorige Ausgabe button', () => {
    render(<TimeMachineBar {...defaultProps} />);
    expect(screen.getByRole('button', { name: /Vorige Ausgabe/ })).toBeInTheDocument();
  });

  it('calls onGoToLatest on Heute click', () => {
    const onGoToLatest = vi.fn();
    render(
      <TimeMachineBar
        {...defaultProps}
        selectedEdition="2026-03-27"
        onGoToLatest={onGoToLatest}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Heute' }));
    expect(onGoToLatest).toHaveBeenCalledOnce();
  });

  it('calls onGoToEdition on previous click', () => {
    const onGoToEdition = vi.fn();
    render(
      <TimeMachineBar
        {...defaultProps}
        selectedEdition="2026-03-28"
        onGoToEdition={onGoToEdition}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Vorige Ausgabe/ }));
    expect(onGoToEdition).toHaveBeenCalledWith('2026-03-27');
  });

  it('shows current/archive label', () => {
    const { rerender } = render(
      <TimeMachineBar {...defaultProps} selectedEdition={null} />,
    );
    // "Aktuelle Ausgabe" appears in both the span and the select option;
    // target the span with class time-machine-current
    expect(document.querySelector('.time-machine-current')).toHaveTextContent('Aktuelle Ausgabe');

    rerender(
      <TimeMachineBar {...defaultProps} selectedEdition="2026-03-27" />,
    );
    expect(document.querySelector('.time-machine-current')).toHaveTextContent('Ausgabe 2026-03-27');
  });

  it('select change triggers navigation', () => {
    const onGoToEdition = vi.fn();
    const onGoToLatest = vi.fn();
    render(
      <TimeMachineBar
        {...defaultProps}
        onGoToEdition={onGoToEdition}
        onGoToLatest={onGoToLatest}
      />,
    );
    const select = screen.getByRole('combobox');

    fireEvent.change(select, { target: { value: '2026-03-27' } });
    expect(onGoToEdition).toHaveBeenCalledWith('2026-03-27');

    fireEvent.change(select, { target: { value: '' } });
    expect(onGoToLatest).toHaveBeenCalledOnce();
  });
});
