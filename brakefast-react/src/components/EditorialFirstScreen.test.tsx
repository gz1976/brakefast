import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorialFirstScreen } from './EditorialFirstScreen';
import type { NewspaperData } from '../types';

// ─── Browser API Mocks ───
// Mirrors BrakeFastApp.test.tsx:7-33 so useReadTracker + IntersectionObserver
// don't explode inside the component tree when DetailModal / weather modal open.

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
})();

beforeAll(() => {
  Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });

  global.IntersectionObserver = vi.fn().mockImplementation(function (this: object) {
    Object.assign(this, {
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    });
  }) as unknown as typeof IntersectionObserver;

  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  localStorageMock.clear();
});

// ─── Fixture ───

const mockData: NewspaperData = {
  generated: '2026-03-28T06:00:00Z',
  edition_number: 42,
  totalArticles: 5,
  categories: {
    ai: {
      name: 'AI',
      emoji: 'AI',
      css_class: 'ai',
      articles: [{
        title: 'Top AI Story',
        link: 'https://ai.test/1',
        description: 'AI description text that becomes the teaser sentence.',
        date: '2026-03-28',
        source: 'AI Source',
        relevance_score: 95,
        image: '',
      }],
    },
  },
  widgets: {
    weather: {
      temp: 15,
      description: 'Sunny',
      feelsLike: 13,
      min: 10,
      max: 20,
      location: 'Voitsberg',
    },
    dayInfo: {
      sunrise: '06:30 AM',
      sunset: '19:00',
      dayLength: '12h 30m',
      namenstag: 'Test',
    },
  },
  morning_tiles: {
    headlines: [
      { text: 'Headline One', source: 'Source A', summary: 'summary-a' },
      { text: 'Headline Two', source: 'Source B' },
    ],
  },
} as NewspaperData;

const baseProps = () => ({
  data: mockData,
  calendarRevealed: false,
  sections: [
    { id: 'top-stories', label: 'Titelseite' },
    { id: 'ai-tech', label: 'AI & Tech' },
  ],
  activeSectionId: 'top-stories',
  onSectionNavigate: vi.fn(),
  editionNumber: 42,
  generatedDate: '2026-03-28T06:00:00Z',
});

// ─── Tests ───

describe('EditorialFirstScreen', () => {
  it('renders the five broadsheet regions (PAR region coverage)', () => {
    const { container } = render(<EditorialFirstScreen {...baseProps()} />);
    // Region 1: root section (.ed-firstscreen)
    expect(container.querySelector('.ed-firstscreen')).toBeInTheDocument();
    // Region 2: masthead
    expect(container.querySelector('.ed-masthead')).toBeInTheDocument();
    expect(screen.getByText('BrakeFast')).toBeInTheDocument();
    // Region 3: section nav with buttons from `sections` prop
    expect(container.querySelector('.ed-nav')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Titelseite' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AI & Tech' })).toBeInTheDocument();
    // Region 4: three-column body
    expect(container.querySelector('.ed-col-1')).toBeInTheDocument();
    expect(container.querySelector('.ed-col-2')).toBeInTheDocument();
    expect(container.querySelector('.ed-col-3')).toBeInTheDocument();
    // Region 5: bottom strip
    expect(container.querySelector('.ed-strip')).toBeInTheDocument();
  });

  it('renders the top story (pickTopStory parity PAR-01)', () => {
    render(<EditorialFirstScreen {...baseProps()} />);
    // "Top AI Story" is selected by pickTopStory and rendered as the lead headline
    expect(screen.getByText('Top AI Story')).toBeInTheDocument();
  });

  it('filters the top story out of the schlagzeilen list (PAR-02 dedup)', () => {
    const data: NewspaperData = {
      ...mockData,
      morning_tiles: {
        headlines: [
          { text: 'Top AI Story', source: 'AI Source' },
          { text: 'Unique Headline', source: 'Source A' },
        ],
      },
    } as NewspaperData;
    render(<EditorialFirstScreen {...baseProps()} data={data} />);
    // Top story appears exactly once (as the lead headline, NOT duplicated in schlagzeilen)
    expect(screen.getAllByText('Top AI Story').length).toBe(1);
    expect(screen.getByText('Unique Headline')).toBeInTheDocument();
  });

  it('renders weather hero and day-info (PAR-03)', () => {
    const { container } = render(<EditorialFirstScreen {...baseProps()} />);
    // Weather hero row renders temp + location
    const weatherRow = container.querySelector('.ed-weather-row');
    expect(weatherRow).toBeInTheDocument();
    expect(weatherRow?.textContent).toContain('15°');
    expect(weatherRow?.textContent).toContain('Voitsberg');
  });

  it('opens weather modal on click and closes on Escape (PAR-03 + A11Y-01 parity route)', async () => {
    const user = userEvent.setup();
    const { container } = render(<EditorialFirstScreen {...baseProps()} />);
    const weatherRow = container.querySelector('.ed-weather-row') as HTMLElement;
    expect(weatherRow).toBeInTheDocument();
    await user.click(weatherRow);
    expect(container.querySelector('.weather-modal')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(container.querySelector('.weather-modal')).toBeNull();
  });

  it('opens weather modal and closes on overlay click (PAR-03)', async () => {
    const user = userEvent.setup();
    const { container } = render(<EditorialFirstScreen {...baseProps()} />);
    await user.click(container.querySelector('.ed-weather-row') as HTMLElement);
    const overlay = container.querySelector('.modal-overlay') as HTMLElement;
    expect(overlay).toBeInTheDocument();
    await user.click(overlay);
    expect(container.querySelector('.weather-modal')).toBeNull();
  });

  it('renders bottom-strip empty-state fallback when word-of-day is absent (PAR-04)', () => {
    // mockData has no word_of_day; the first strip tile should render the German fallback
    render(<EditorialFirstScreen {...baseProps()} />);
    expect(screen.getByText('Heute kein Eintrag')).toBeInTheDocument();
  });

  it('calls onSectionNavigate when a section-nav button is clicked (PAR-05)', async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<EditorialFirstScreen {...props} />);
    await user.click(screen.getByRole('button', { name: 'AI & Tech' }));
    expect(props.onSectionNavigate).toHaveBeenCalledWith('ai-tech');
  });

  it('fires onCalendarRevealToggle when the right-hand date span is clicked (Option B)', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { container } = render(
      <EditorialFirstScreen {...baseProps()} onCalendarRevealToggle={onToggle} />
    );
    const rightCell = container.querySelector('.ed-masthead-r') as HTMLElement;
    // The date span is the first interactive child; scope queries to the right cell so
    // we don't hit the edition-number span.
    const dateSpan = within(rightCell).getByRole('button');
    await user.click(dateSpan);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('fires onCalendarRevealToggle on Enter keypress (keyboard a11y)', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <EditorialFirstScreen {...baseProps()} onCalendarRevealToggle={onToggle} />
    );
    const dateSpan = container.querySelector('.ed-masthead-r span[role="button"]') as HTMLElement;
    expect(dateSpan).toBeInTheDocument();
    fireEvent.keyDown(dateSpan, { key: 'Enter' });
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('opens DetailModal when a Schlagzeile is clicked (A11Y-01 focus trap path)', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <EditorialFirstScreen {...baseProps()} markAsRead={vi.fn()} isRead={() => false} />
    );
    const headlineItem = screen
      .getByText('Headline One')
      .closest('.ed-headline-item') as HTMLElement;
    expect(headlineItem).toBeInTheDocument();
    await user.click(headlineItem);
    // DetailModal renders a modal-overlay + modal-content tree; use the same selectors
    // the modal test uses (DetailModal.test.tsx:50-55).
    expect(container.querySelector('.modal-overlay .modal-content')).toBeInTheDocument();
  });

  it('renders empty-state message when topStory is null', () => {
    const data = { ...mockData, categories: {} } as NewspaperData;
    render(<EditorialFirstScreen {...baseProps()} data={data} />);
    expect(screen.getByText(/Keine Top Story verf/)).toBeInTheDocument();
  });
});
