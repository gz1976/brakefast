import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { useNewspaper } from './hooks/useNewspaper';
import type { NewspaperData } from './types';

vi.mock('./hooks/useNewspaper', () => ({
  useNewspaper: vi.fn(),
}));

vi.mock('./components/BrakeFastApp', () => ({
  BrakeFastApp: () => <main data-testid="brakefast-view" />,
}));

vi.mock('./components/OttoMonitor', () => ({
  OttoMonitor: () => <main data-testid="monitor-view" />,
}));

type NewspaperResult = ReturnType<typeof useNewspaper>;

function newspaperResult(overrides: Partial<NewspaperResult> = {}): NewspaperResult {
  return {
    data: null,
    loading: false,
    error: null,
    archiveEditions: [],
    selectedEdition: null,
    goToLatest: vi.fn(),
    goToEdition: vi.fn(),
    ...overrides,
  };
}

function expectOttoHomeLink() {
  const link = screen.getByRole('link', { name: 'Zur OTTO-Übersicht' });
  expect(link).toHaveTextContent('← OTTO');
  expect(link).toHaveAttribute('data-otto-home');
  expect(link).toHaveAttribute('href', 'https://ottobot.net/');
}

describe('global OTTO home link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/');
    vi.mocked(useNewspaper).mockReturnValue(newspaperResult({ loading: true }));
  });

  it('is available while BrakeFast is loading', () => {
    render(<App />);

    expect(screen.getByText('Lade heutige Ausgabe…')).toBeInTheDocument();
    expectOttoHomeLink();
  });

  it('is available when BrakeFast data loading fails', () => {
    vi.mocked(useNewspaper).mockReturnValue(newspaperResult({ error: 'Netzwerkfehler' }));

    render(<App />);

    expect(screen.getByText('Netzwerkfehler')).toBeInTheDocument();
    expectOttoHomeLink();
  });

  it('is available in the newspaper view', () => {
    const data: NewspaperData = { totalArticles: 0, categories: {} };
    vi.mocked(useNewspaper).mockReturnValue(newspaperResult({ data }));

    render(<App />);

    expect(screen.getByTestId('brakefast-view')).toBeInTheDocument();
    expectOttoHomeLink();
  });

  it('is available in the monitor view without loading newspaper data', () => {
    window.history.replaceState({}, '', '/#monitor');

    render(<App />);

    expect(screen.getByTestId('monitor-view')).toBeInTheDocument();
    expect(useNewspaper).not.toHaveBeenCalled();
    expectOttoHomeLink();
  });
});
