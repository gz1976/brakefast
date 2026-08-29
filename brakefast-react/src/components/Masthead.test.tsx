import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Masthead } from './Masthead';

const baseProps = {
  date: '2026-03-28T07:00:00Z',
  totalArticles: 42,
};

describe('Masthead', () => {
  it('renders location text', () => {
    render(<Masthead {...baseProps} />);
    expect(screen.getByText('Voitsberg, Steiermark')).toBeInTheDocument();
  });

  it('renders logo text', () => {
    render(<Masthead {...baseProps} />);
    expect(screen.getByText('BrakeFast')).toBeInTheDocument();
  });

  it('does not render the retired article-count chip', () => {
    render(<Masthead {...baseProps} />);
    expect(screen.queryByText('42 Artikel')).not.toBeInTheDocument();
  });

  it('shows edition number when provided', () => {
    render(<Masthead {...baseProps} editionNumber={17} />);
    expect(screen.getByText(/Ausgabe #\s*17/)).toBeInTheDocument();
  });

  it('hides edition number when not provided', () => {
    render(<Masthead {...baseProps} />);
    expect(screen.queryByText(/#\d+/)).not.toBeInTheDocument();
  });

  it('does not render the retired reading-time chip', () => {
    render(<Masthead {...baseProps} readingTimeTotal={25} />);
    expect(screen.queryByText(/~\s*25\s*Min/)).not.toBeInTheDocument();
  });

  it('hides reading time when not provided', () => {
    render(<Masthead {...baseProps} />);
    expect(screen.queryByText(/Min\./)).not.toBeInTheDocument();
  });

  it('calls onLogoClick on click', () => {
    const onLogoClick = vi.fn();
    render(<Masthead {...baseProps} onLogoClick={onLogoClick} />);

    fireEvent.click(screen.getByRole('button', { name: /Brake/i }));
    expect(onLogoClick).toHaveBeenCalledOnce();
  });

  it('calls onLogoClick on Enter key', () => {
    const onLogoClick = vi.fn();
    render(<Masthead {...baseProps} onLogoClick={onLogoClick} />);

    fireEvent.keyDown(screen.getByRole('button', { name: /Brake/i }), { key: 'Enter' });
    expect(onLogoClick).toHaveBeenCalledOnce();
  });
});
