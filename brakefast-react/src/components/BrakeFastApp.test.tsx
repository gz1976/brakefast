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
  it('renders the editorial masthead with edition number', () => {
    render(<BrakeFastApp {...defaultProps()} />);

    expect(screen.getByText('BrakeFast')).toBeInTheDocument();
    expect(screen.getByText(/No\. 42/)).toBeInTheDocument();
  });

  it('renders editorial sections for available categories', () => {
    const { container } = render(<BrakeFastApp {...defaultProps()} />);

    const sectionLabels = Array.from(
      container.querySelectorAll('.ed-cat-head-name'),
    ).map((el) => el.textContent);

    expect(sectionLabels).toContain('AI & Tech');
    expect(sectionLabels).toContain('Security');
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

  it('opens EditorialArticleModal when an article is clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(<BrakeFastApp {...defaultProps()} />);

    const leadStoryHeadline = container.querySelector('#ai-tech .ed-cat-lead-headline') as HTMLElement;
    expect(leadStoryHeadline).toBeInTheDocument();

    await user.click(leadStoryHeadline);

    expect(screen.getByRole('button', { name: 'Artikel schlie\u00dfen' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Artikel \u00f6ffnen \u2192' })).toHaveAttribute(
      'href',
      'https://example.com/ai1',
    );
  });

  it('closes EditorialArticleModal when close button is clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(<BrakeFastApp {...defaultProps()} />);

    const leadStoryHeadline = container.querySelector('#ai-tech .ed-cat-lead-headline') as HTMLElement;
    await user.click(leadStoryHeadline);

    const closeButton = screen.getByRole('button', { name: 'Artikel schlie\u00dfen' });
    expect(closeButton).toBeInTheDocument();

    await user.click(closeButton);

    expect(screen.queryByRole('button', { name: 'Artikel schlie\u00dfen' })).not.toBeInTheDocument();
  });

  it('does not crash with empty categories', () => {
    const data = createTestData({
      categories: {},
      totalArticles: 0,
    });

    const { container } = render(
      <BrakeFastApp {...defaultProps()} data={data} />,
    );

    // EditorialFirstScreen provides a dedicated empty state and the shell survives.
    expect(screen.getByText('Keine Top Story verf\u00fcgbar.')).toBeInTheDocument();
    expect(container.querySelector('.footer')).toBeInTheDocument();

    expect(container.querySelectorAll('.ed-category')).toHaveLength(0);
  });

  it('does not crash with missing widgets', () => {
    const data = createTestData({
      widgets: undefined,
    });

    render(<BrakeFastApp {...defaultProps()} data={data} />);

    // App renders without exploding
    expect(screen.getByText('BrakeFast')).toBeInTheDocument();
    expect(screen.getByText('Wetter nicht verf\u00fcgbar')).toBeInTheDocument();
  });

  it('marks article as read after clicking it', async () => {
    const user = userEvent.setup();
    const { container } = render(<BrakeFastApp {...defaultProps()} />);

    const leadStoryHeadline = container.querySelector('#ai-tech .ed-cat-lead-headline') as HTMLElement;
    await user.click(leadStoryHeadline);

    // After clicking, the article link should be stored in localStorage
    const stored = localStorageMock.getItem('brakefast-read-items');
    expect(stored).toBeTruthy();
    expect(stored).toContain('example.com/ai1');
  });

  it('ErrorBoundary catches section render errors without breaking the page', () => {
    // Suppress console.error for the expected boundary catch
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Create a data set where the AI category has an article whose toString()
    // on certain fields will cause a render error inside the editorial section.
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
    // Title appears in both the first screen and editorial category, so use getAllByText.
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

    const sectionLabels = Array.from(
      container.querySelectorAll('.ed-cat-head-name'),
    ).map((el) => el.textContent);

    expect(sectionLabels).toContain('AI & Tech');
    expect(sectionLabels).toContain('Welt');
    expect(sectionLabels).not.toContain('Security');
  });
});

describe('BrakeFastApp permanent editorial layout', () => {
  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it.each(['/', '/?editorial=1', '/?editorial=true'])(
    'renders only the editorial path for %s',
    (path) => {
      window.history.pushState({}, '', path);
      const { container } = render(<BrakeFastApp {...defaultProps()} />);
      expect(container.querySelector('.ed-firstscreen')).toBeInTheDocument();
      expect(container.querySelectorAll('.ed-category').length).toBeGreaterThanOrEqual(1);
      expect(container.querySelector('.masthead')).toBeNull();
      expect(container.querySelector('.first-screen')).toBeNull();
      expect(container.querySelector('.hero-briefing')).toBeNull();
      expect(container.querySelector('.section-divider')).toBeNull();
      expect(container.querySelector('.category-section')).toBeNull();
    },
  );
});
