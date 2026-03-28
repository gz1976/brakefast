import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArticleModal } from './ArticleModal';
import type { Article } from '../types';

const baseArticle: Article = {
  title: 'Test Article Title',
  link: 'https://example.com/test',
  description: 'Test description text',
  source: 'Test Source',
  date: '2026-03-28',
};

describe('ArticleModal', () => {
  it('renders article title and source', () => {
    render(<ArticleModal article={baseArticle} onClose={vi.fn()} />);
    expect(screen.getByText('Test Article Title')).toBeInTheDocument();
    expect(screen.getByText('Test Source')).toBeInTheDocument();
  });

  it('renders dek when present in article', () => {
    const article = { ...baseArticle, dek: 'This is the standfirst text' };
    const { container } = render(<ArticleModal article={article} onClose={vi.fn()} />);
    const standfirst = container.querySelector('.modal-standfirst');
    expect(standfirst).not.toBeNull();
    expect(standfirst!.textContent).toBe('This is the standfirst text');
  });

  it('renders "Warum es wichtig ist" section when why_it_matters is present', () => {
    const article = { ...baseArticle, why_it_matters: 'This matters because of X' };
    render(<ArticleModal article={article} onClose={vi.fn()} />);
    expect(screen.getByText('Warum es wichtig ist')).toBeInTheDocument();
    expect(screen.getByText('This matters because of X')).toBeInTheDocument();
  });

  it('does NOT render "Warum es wichtig ist" when why_it_matters is absent', () => {
    render(<ArticleModal article={baseArticle} onClose={vi.fn()} />);
    expect(screen.queryByText('Warum es wichtig ist')).not.toBeInTheDocument();
  });

  it('calls onClose when Escape key is pressed', async () => {
    const onClose = vi.fn();
    render(<ArticleModal article={baseArticle} onClose={onClose} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when overlay is clicked', async () => {
    const onClose = vi.fn();
    const { container } = render(<ArticleModal article={baseArticle} onClose={onClose} />);
    const overlay = container.querySelector('.modal-overlay');
    expect(overlay).not.toBeNull();
    await userEvent.click(overlay!);
    expect(onClose).toHaveBeenCalled();
  });
});
