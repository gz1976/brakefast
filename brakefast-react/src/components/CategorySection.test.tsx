import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CategorySection } from './CategorySection';
import type { Article } from '../types';

function createArticle(overrides: Partial<Article> = {}): Article {
  return {
    title: 'Test Article',
    link: 'https://example.com/test',
    source: 'Test Source',
    date: '2026-03-28',
    description: 'Test description',
    summary: 'Test summary',
    image: '',
    reading_time_minutes: 3,
    relevance_score: 0.8,
    ...overrides,
  } as Article;
}

const defaultProps = {
  categoryId: 'tech',
  label: 'Technology',
  sectionId: 'tech-section',
  onArticleClick: vi.fn(),
};

describe('CategorySection', () => {
  it('returns null with no articles and no extraCards', () => {
    const { container } = render(
      <CategorySection {...defaultProps} articles={[]} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders section label', () => {
    render(
      <CategorySection
        {...defaultProps}
        articles={[createArticle()]}
      />,
    );
    // Label appears in category-badge elements
    expect(screen.getAllByText('Technology').length).toBeGreaterThan(0);
  });

  it('renders lead story title', () => {
    render(
      <CategorySection
        {...defaultProps}
        articles={[createArticle({ title: 'Lead Title' })]}
      />,
    );
    expect(screen.getByText('Lead Title')).toBeInTheDocument();
  });

  it('renders secondary stories (up to 5)', () => {
    const articles = Array.from({ length: 7 }, (_, i) =>
      createArticle({ title: `Article ${i}`, link: `https://example.com/${i}` }),
    );
    render(<CategorySection {...defaultProps} articles={articles} />);
    // Lead is Article 0, secondary should be Article 1-5 (5 items)
    expect(screen.getByText('Article 1')).toBeInTheDocument();
    expect(screen.getByText('Article 5')).toBeInTheDocument();
    expect(screen.queryByText('Article 6')).not.toBeInTheDocument();
  });

  it('calls onArticleClick on lead click', () => {
    const onArticleClick = vi.fn();
    const lead = createArticle({ title: 'Lead' });
    render(
      <CategorySection
        {...defaultProps}
        articles={[lead]}
        onArticleClick={onArticleClick}
      />,
    );
    fireEvent.click(screen.getByText('Lead'));
    expect(onArticleClick).toHaveBeenCalledWith(lead);
  });

  it('calls onArticleClick on secondary click', () => {
    const onArticleClick = vi.fn();
    const secondary = createArticle({ title: 'Secondary', link: 'https://example.com/sec' });
    render(
      <CategorySection
        {...defaultProps}
        articles={[createArticle(), secondary]}
        onArticleClick={onArticleClick}
      />,
    );
    fireEvent.click(screen.getByText('Secondary'));
    expect(onArticleClick).toHaveBeenCalledWith(secondary);
  });

  it('shows unread dot when isRead returns false', () => {
    const isRead = vi.fn().mockReturnValue(false);
    render(
      <CategorySection
        {...defaultProps}
        articles={[createArticle()]}
        isRead={isRead}
      />,
    );
    expect(document.querySelector('.unread-dot')).toBeInTheDocument();
  });

  it('hides unread dot when isRead returns true', () => {
    const isRead = vi.fn().mockReturnValue(true);
    render(
      <CategorySection
        {...defaultProps}
        articles={[createArticle()]}
        isRead={isRead}
      />,
    );
    expect(document.querySelector('.unread-dot')).not.toBeInTheDocument();
  });

  it('shows placeholder when image is invalid', () => {
    render(
      <CategorySection
        {...defaultProps}
        articles={[createArticle({ image: '' })]}
      />,
    );
    expect(document.querySelector('.lead-story-placeholder')).toBeInTheDocument();
  });

  it('renders extraCards when provided', () => {
    render(
      <CategorySection
        {...defaultProps}
        articles={[]}
        extraCards={<div data-testid="extra">Extra Content</div>}
      />,
    );
    expect(screen.getByTestId('extra')).toBeInTheDocument();
  });
});
