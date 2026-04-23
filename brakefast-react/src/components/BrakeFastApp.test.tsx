import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrakeFastApp } from './BrakeFastApp';
import type { NewspaperData, Article, ArchiveEdition } from '../types';

// ─── Browser API Mocks ───

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

// ─── Data Factories ───

function createArticle(overrides: Partial<Article> = {}): Article {
  return {
    title: 'Test Article',
    headline: 'Test Headline',
    link: 'https://example.com/test',
    source: 'Test Source',
    date: '2026-03-28',
    description: 'Test description text',
    summary: 'Test summary text',
    image: '',
    reading_time_minutes: 3,
    relevance_score: 0.8,
    ...overrides,
  } as Article;
}

function createTestData(overrides: Partial<NewspaperData> = {}): NewspaperData {
  return {
    generated: '2026-03-28T06:30:00Z',
    edition_number: 42,
    totalArticles: 6,
    reading_time_total: 15,
    categories: {
      ai: {
        name: 'AI & Machine Learning',
        emoji: '\u{1F916}',
        css_class: 'ai',
        articles: [
          createArticle({ title: 'AI Article 1', link: 'https://example.com/ai1' }),
          createArticle({ title: 'AI Article 2', link: 'https://example.com/ai2' }),
        ],
      },
      security: {
        name: 'Security',
        emoji: '\u{1F512}',
        css_class: 'security',
        articles: [
          createArticle({ title: 'Security Article', link: 'https://example.com/sec1' }),
        ],
      },
    },
    widgets: {
      weather: {
        temp: 15,
        feelsLike: 13,
        min: 8,
        max: 18,
        description: 'Sonnig',
        icon: '\u2600\uFE0F',
        location: 'Voitsberg',
      },
      dayInfo: { sunrise: '06:15', sunset: '19:30', dayLength: '13h 15m', namenstag: 'Josef' },
      quote: { text: 'Test quote', author: 'Test Author' },
      calendar: [],
      history: { year: 1990, text: 'Something happened' },
    },
    morning_tiles: {
      headlines: [{ text: 'Breaking News', source: 'Reuters' }],
      streaming: [],
      events: [],
      media_tip: undefined,
    },
    ...overrides,
  } as NewspaperData;
}

const defaultProps = () => ({
  data: createTestData(),
  archiveEditions: [] as ArchiveEdition[],
  selectedEdition: null as string | null,
  onGoToLatest: vi.fn(),
  onGoToEdition: vi.fn(),
});

// ─── Tests ───

describe('BrakeFastApp', () => {
  it('renders masthead with edition number and article count', () => {
    render(<BrakeFastApp {...defaultProps()} />);

    expect(screen.getByText(/Ausgabe #42/)).toBeInTheDocument();
    expect(screen.getByText('6 Artikel')).toBeInTheDocument();
  });

  it('renders section dividers for available categories', () => {
    const { container } = render(<BrakeFastApp {...defaultProps()} />);

    // Use the section-divider-label class to avoid matching nav pills and category badges
    const dividerLabels = Array.from(
      container.querySelectorAll('.section-divider-label'),
    ).map((el) => el.textContent);

    expect(dividerLabels).toContain('AI & Tech');
    expect(dividerLabels).toContain('Security');
  });

  it('renders footer with generation date', () => {
    const { container } = render(<BrakeFastApp {...defaultProps()} />);

    const footer = container.querySelector('.footer')!;
    expect(footer).toBeInTheDocument();

    // Footer shows "Generiert am ..." with the date
    const footerScope = within(footer as HTMLElement);
    expect(footerScope.getByText(/Generiert am/)).toBeInTheDocument();
    expect(footerScope.getByText(/Ausgabe/)).toBeInTheDocument();
  });

  it('opens ArticleModal when an article is clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(<BrakeFastApp {...defaultProps()} />);

    // Target the lead-story link inside a category-section (not the hero briefing)
    const leadStoryLink = container.querySelector('.lead-story')!;
    expect(leadStoryLink).toBeInTheDocument();

    await user.click(leadStoryLink);

    // Modal should now be visible with the article title and source link
    expect(screen.getByText(/Weiterlesen auf Test Source/)).toBeInTheDocument();
    // Modal has a close button
    expect(screen.getByText('\u2715')).toBeInTheDocument();
  });

  it('closes ArticleModal when close button is clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(<BrakeFastApp {...defaultProps()} />);

    // Open modal by clicking lead story
    const leadStoryLink = container.querySelector('.lead-story')!;
    await user.click(leadStoryLink);

    // Verify modal is open
    expect(screen.getByText(/Weiterlesen auf Test Source/)).toBeInTheDocument();

    // Click close button
    const closeButton = screen.getByText('\u2715');
    await user.click(closeButton);

    // Modal content should be gone
    expect(screen.queryByText(/Weiterlesen auf Test Source/)).not.toBeInTheDocument();
  });

  it('does not crash with empty categories', () => {
    const data = createTestData({
      categories: {},
      totalArticles: 0,
    });

    const { container } = render(
      <BrakeFastApp {...defaultProps()} data={data} />,
    );

    // App still renders masthead and footer
    expect(screen.getByText('BrakeFast')).toBeInTheDocument();
    expect(container.querySelector('.footer')).toBeInTheDocument();

    // No section dividers rendered
    expect(container.querySelectorAll('.section-divider')).toHaveLength(0);
  });

  it('does not crash with missing widgets', () => {
    const data = createTestData({
      widgets: undefined,
    });

    render(<BrakeFastApp {...defaultProps()} data={data} />);

    // App renders without exploding
    expect(screen.getByText('BrakeFast')).toBeInTheDocument();
    expect(screen.getByText('6 Artikel')).toBeInTheDocument();
  });

  it('marks article as read after clicking it', async () => {
    const user = userEvent.setup();
    const { container } = render(<BrakeFastApp {...defaultProps()} />);

    const leadStoryLink = container.querySelector('.lead-story')!;
    await user.click(leadStoryLink);

    // After clicking, the article link should be stored in localStorage
    const stored = localStorageMock.getItem('brakefast-read-items');
    expect(stored).toBeTruthy();
    expect(stored).toContain('example.com/ai1');
  });

  it('ErrorBoundary catches section render errors without breaking the page', () => {
    // Suppress console.error for the expected boundary catch
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Create a data set where the AI category has an article whose toString()
    // on certain fields will cause a render error inside CategorySection.
    // We use an object with a getter that throws as the title.
    const badArticle = {
      get title(): string { throw new Error('Simulated render crash'); },
      link: 'https://example.com/bad',
      description: 'broken',
      source: 'test',
      date: '2026-03-28',
    } as unknown as Article;

    const data = createTestData({
      categories: {
        ai: {
          name: 'AI & Machine Learning',
          emoji: '\u{1F916}',
          css_class: 'ai',
          articles: [badArticle],
        },
        security: {
          name: 'Security',
          emoji: '\u{1F512}',
          css_class: 'security',
          articles: [
            createArticle({ title: 'Security Still Works', link: 'https://example.com/sec1' }),
          ],
        },
      },
    });

    const { container } = render(<BrakeFastApp {...defaultProps()} data={data} />);

    // The security section should still render even if AI section errors
    // Title appears in both HeroBriefing (top story) and CategorySection, so use getAllByText
    expect(screen.getAllByText('Security Still Works').length).toBeGreaterThanOrEqual(1);

    // Footer should still render
    const footer = container.querySelector('.footer')!;
    expect(footer).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('only renders sections for categories that have articles', () => {
    const data = createTestData({
      categories: {
        ai: {
          name: 'AI & Machine Learning',
          emoji: '\u{1F916}',
          css_class: 'ai',
          articles: [createArticle({ title: 'AI Article', link: 'https://example.com/ai1' })],
        },
        security: {
          name: 'Security',
          emoji: '\u{1F512}',
          css_class: 'security',
          articles: [], // empty -- should not render
        },
        world: {
          name: 'World',
          emoji: '\u{1F30D}',
          css_class: 'world',
          articles: [createArticle({ title: 'World Article', link: 'https://example.com/w1' })],
        },
      },
    });

    const { container } = render(
      <BrakeFastApp {...defaultProps()} data={data} />,
    );

    // AI and World sections render their dividers
    const dividerLabels = Array.from(
      container.querySelectorAll('.section-divider-label'),
    ).map((el) => el.textContent);

    expect(dividerLabels).toContain('AI & Tech');
    expect(dividerLabels).toContain('Welt');
    // Security has 0 articles, so no divider
    expect(dividerLabels).not.toContain('Security');
  });
});

describe('BrakeFastApp editorial flag (ROLL-01 + EDIT-03)', () => {
  // Reset URL between tests so flag state doesn't bleed into the wider suite.
  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('renders EditorialFirstScreen when ?editorial=1 is present', () => {
    window.history.pushState({}, '', '/?editorial=1');
    const { container } = render(<BrakeFastApp {...defaultProps()} />);
    expect(container.querySelector('.ed-firstscreen')).toBeInTheDocument();
    // Legacy nodes must NOT render in the editorial branch
    expect(container.querySelector('.masthead')).toBeNull();
    expect(container.querySelector('.first-screen')).toBeNull();
    expect(container.querySelector('.hero-briefing')).toBeNull();
  });

  it('renders legacy Masthead + first-screen when the flag is absent (default path unchanged)', () => {
    window.history.pushState({}, '', '/');
    const { container } = render(<BrakeFastApp {...defaultProps()} />);
    expect(container.querySelector('.masthead')).toBeInTheDocument();
    expect(container.querySelector('.first-screen')).toBeInTheDocument();
    expect(container.querySelector('.hero-briefing')).toBeInTheDocument();
    expect(container.querySelector('.ed-firstscreen')).toBeNull();
  });

  it('renders legacy path when ?editorial has a non-"1" value (strict comparison)', () => {
    window.history.pushState({}, '', '/?editorial=true');
    const { container } = render(<BrakeFastApp {...defaultProps()} />);
    expect(container.querySelector('.masthead')).toBeInTheDocument();
    expect(container.querySelector('.ed-firstscreen')).toBeNull();
  });

  it('renders .ed-category sections and hides .section-divider when ?editorial=1 is present (EDIT-04)', () => {
    window.history.pushState({}, '', '/?editorial=1');
    const { container } = render(<BrakeFastApp {...defaultProps()} />);
    // Editorial branch emits .ed-category for every non-empty category
    expect(container.querySelectorAll('.ed-category').length).toBeGreaterThanOrEqual(1);
    // Legacy SectionDivider MUST NOT render when the flag is on
    expect(container.querySelectorAll('.section-divider').length).toBe(0);
    // Legacy CategorySection MUST NOT render either
    expect(container.querySelectorAll('.category-section').length).toBe(0);
  });

  it('renders .section-divider + .category-section and hides .ed-category when the flag is absent (EDIT-04 legacy preservation)', () => {
    window.history.pushState({}, '', '/');
    const { container } = render(<BrakeFastApp {...defaultProps()} />);
    expect(container.querySelectorAll('.section-divider').length).toBeGreaterThanOrEqual(1);
    expect(container.querySelectorAll('.category-section').length).toBeGreaterThanOrEqual(1);
    expect(container.querySelectorAll('.ed-category').length).toBe(0);
  });
});
