import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorialCategorySection } from './EditorialCategorySection';
import type { Article } from '../types';

// ─── Browser API Mocks ───
// Mirrors BrakeFastApp.test.tsx:7-37 — canonical localStorageMock + IntersectionObserver
// + scrollIntoView setup required for shared hook compatibility.

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
    Object.assign(this, { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() });
  }) as unknown as typeof IntersectionObserver;
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => { localStorageMock.clear(); });

// ─── Fixture ───

function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    title: 'Test Article',
    link: 'https://example.com/test',
    source: 'Test Source',
    date: '2026-04-19',
    description: 'Test description text that serves as the teaser sentence.',
    summary: 'Test summary',
    image: '',
    reading_time_minutes: 3,
    relevance_score: 0.8,
    ...overrides,
  } as Article;
}

const fixtureArticles: Article[] = [
  makeArticle({ title: 'Lead Story',    link: 'https://example.com/lead'  }),
  makeArticle({ title: 'Stacked One',   link: 'https://example.com/one'   }),
  makeArticle({ title: 'Stacked Two',   link: 'https://example.com/two'   }),
  makeArticle({ title: 'Stacked Three', link: 'https://example.com/three' }),
  makeArticle({ title: 'Stacked Four',  link: 'https://example.com/four'  }),
];

const baseProps = () => ({
  articles: fixtureArticles,
  categoryId: 'ai',
  label: 'AI & Tech',
  sectionId: 'ai-tech',
  editionNumber: 42,
  generatedDate: '2026-04-19T06:30:00Z',
  onArticleClick: vi.fn(),
  isRead: vi.fn().mockReturnValue(false),
});

// ─── Tests ───

describe('EditorialCategorySection', () => {
  it('renders the root .ed-category with the correct sectionId as id', () => {
    const { container } = render(<EditorialCategorySection {...baseProps()} />);
    const root = container.querySelector('.ed-category');
    expect(root).toBeInTheDocument();
    expect(root?.id).toBe('ai-tech');
  });

  it('renders the newsprint section head with ALL-CAPS label + AUSGABE dateline (D-06)', () => {
    const { container } = render(<EditorialCategorySection {...baseProps()} />);
    const head = container.querySelector('.ed-cat-head');
    expect(head).toBeInTheDocument();
    expect(container.querySelector('.ed-cat-head-name')?.textContent).toBe('AI & Tech');
    const dateline = container.querySelector('.ed-cat-dateline')?.textContent || '';
    expect(dateline).toMatch(/AUSGABE #42/);
    expect(dateline).toMatch(/2026/);
  });

  it('renders the lead article with headline, deck, and body (D-04 left column)', () => {
    render(<EditorialCategorySection {...baseProps()} />);
    expect(screen.getByText('Lead Story')).toBeInTheDocument();
    // Deck comes from getArticleTeaser — truthy text from description
    const deckText = document.querySelector('.ed-cat-lead-deck')?.textContent || '';
    expect(deckText.length).toBeGreaterThan(0);
    const bodyText = document.querySelector('.ed-cat-lead-body')?.textContent || '';
    expect(bodyText.length).toBeGreaterThan(0);
  });

  it('renders exactly 4 stacked items (D-05 resolved: articles.slice(1, 5))', () => {
    const { container } = render(<EditorialCategorySection {...baseProps()} />);
    const stackItems = container.querySelectorAll('.ed-cat-stack-item');
    expect(stackItems.length).toBe(4);
    expect(screen.getByText('Stacked One')).toBeInTheDocument();
    expect(screen.getByText('Stacked Two')).toBeInTheDocument();
    expect(screen.getByText('Stacked Three')).toBeInTheDocument();
    expect(screen.getByText('Stacked Four')).toBeInTheDocument();
  });

  it('renders only 2 stacked items when the fixture has 3 articles (Welt floor — graceful slice(1,5))', () => {
    const props = baseProps();
    props.articles = fixtureArticles.slice(0, 3);
    const { container } = render(<EditorialCategorySection {...props} />);
    expect(container.querySelectorAll('.ed-cat-stack-item').length).toBe(2);
  });

  it('calls onArticleClick with the lead article when the lead headline is clicked (D-11 delegation)', async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<EditorialCategorySection {...props} />);
    await user.click(screen.getByText('Lead Story'));
    expect(props.onArticleClick).toHaveBeenCalledTimes(1);
    expect(props.onArticleClick).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Lead Story', link: 'https://example.com/lead' }),
    );
  });

  it('calls onArticleClick with the matching article when a stacked item is clicked', async () => {
    const user = userEvent.setup();
    const props = baseProps();
    const { container } = render(<EditorialCategorySection {...props} />);
    const stackItems = container.querySelectorAll('.ed-cat-stack-item');
    await user.click(stackItems[1] as HTMLElement);
    expect(props.onArticleClick).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Stacked Two' }),
    );
  });

  it('fires onArticleClick when Enter is pressed on a stacked item (keyboard a11y)', () => {
    const props = baseProps();
    const { container } = render(<EditorialCategorySection {...props} />);
    const firstStack = container.querySelector('.ed-cat-stack-item') as HTMLElement;
    expect(firstStack).toBeInTheDocument();
    fireEvent.keyDown(firstStack, { key: 'Enter' });
    expect(props.onArticleClick).toHaveBeenCalledTimes(1);
  });

  it('renders .ed-cat-unread only when isRead returns false (D-12 read-state dot)', () => {
    // All unread → dot on every stacked item
    const unreadProps = baseProps();
    unreadProps.isRead = vi.fn().mockReturnValue(false);
    const { container: unreadContainer } = render(<EditorialCategorySection {...unreadProps} />);
    const dotsUnread = unreadContainer.querySelectorAll('.ed-cat-unread');
    expect(dotsUnread.length).toBeGreaterThan(0);

    // All read → no dots
    const readProps = baseProps();
    readProps.isRead = vi.fn().mockReturnValue(true);
    const { container: readContainer } = render(<EditorialCategorySection {...readProps} />);
    expect(readContainer.querySelectorAll('.ed-cat-unread').length).toBe(0);
  });

  it('returns null when articles is empty (defense in depth — matches CategorySection legacy behaviour)', () => {
    const props = baseProps();
    props.articles = [];
    const { container } = render(<EditorialCategorySection {...props} />);
    expect(container.querySelector('.ed-category')).toBeNull();
  });
});
