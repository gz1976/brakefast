import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Footer } from './Footer';

describe('Footer', () => {
  const generated = '2026-03-28T08:00:00Z';

  it('renders generation timestamp', () => {
    render(<Footer generated={generated} />);
    // The actual component formats date and time separately
    const dateObj = new Date(generated);
    const dateStr = dateObj.toLocaleDateString('de-AT', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    expect(screen.getByText(new RegExp(dateStr))).toBeInTheDocument();
  });

  it('shows edition number when provided', () => {
    render(<Footer generated={generated} editionNumber={42} />);
    expect(screen.getByText(/Ausgabe №42/)).toBeInTheDocument();
  });

  it('hides edition number when not provided', () => {
    render(<Footer generated={generated} />);
    expect(screen.queryByText(/Ausgabe №/)).not.toBeInTheDocument();
  });

  it('shows clear button when clearAll and readCount > 0', () => {
    render(<Footer generated={generated} clearAll={vi.fn()} readCount={5} />);
    expect(screen.getByRole('button', { name: /zuruecksetzen/ })).toBeInTheDocument();
  });

  it('hides clear button when readCount is 0', () => {
    render(<Footer generated={generated} clearAll={vi.fn()} readCount={0} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('first click shows confirmation text', () => {
    render(<Footer generated={generated} clearAll={vi.fn()} readCount={3} />);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(btn).toHaveTextContent('Wirklich loeschen?');
  });

  it('second click calls clearAll and onToast', () => {
    const clearAll = vi.fn();
    const onToast = vi.fn();
    render(<Footer generated={generated} clearAll={clearAll} readCount={3} onToast={onToast} />);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(clearAll).toHaveBeenCalledOnce();
    expect(onToast).toHaveBeenCalledWith('Lesehistorie geloescht');
  });

  describe('confirmation timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('resets confirmation text after 3 seconds', () => {
      render(<Footer generated={generated} clearAll={vi.fn()} readCount={2} />);
      const btn = screen.getByRole('button');
      fireEvent.click(btn);
      expect(btn).toHaveTextContent('Wirklich loeschen?');

      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(btn).toHaveTextContent('Lesehistorie loeschen');
    });
  });
});
