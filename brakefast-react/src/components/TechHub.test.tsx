import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TechHub } from './TechHub';
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

describe('TechHub', () => {
  it('returns null with empty articles', () => {
    const { container } = render(
      <TechHub aiArticles={[]} onArticleClick={vi.fn()} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders CategorySection with correct props', () => {
    render(
      <TechHub
        aiArticles={[createArticle({ title: 'AI News' })]}
        onArticleClick={vi.fn()}
      />,
    );
    expect(screen.getByText('AI & Tech')).toBeInTheDocument();
    expect(screen.getByText('AI News')).toBeInTheDocument();
  });

  it('passes articles through to CategorySection', () => {
    const articles = [
      createArticle({ title: 'First AI', link: 'https://example.com/1' }),
      createArticle({ title: 'Second AI', link: 'https://example.com/2' }),
    ];
    render(<TechHub aiArticles={articles} onArticleClick={vi.fn()} />);
    expect(screen.getByText('First AI')).toBeInTheDocument();
    expect(screen.getByText('Second AI')).toBeInTheDocument();
  });
});
