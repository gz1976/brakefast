import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Toast } from './Toast';

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders message text', () => {
    render(<Toast message="Saved!" visible={false} onDone={vi.fn()} />);
    expect(screen.getByText('Saved!')).toBeInTheDocument();
  });

  it('adds toast-visible class when visible is true', () => {
    render(<Toast message="Hello" visible={true} onDone={vi.fn()} />);
    expect(screen.getByText('Hello')).toHaveClass('toast-visible');
  });

  it('does not add toast-visible class when visible is false', () => {
    render(<Toast message="Hello" visible={false} onDone={vi.fn()} />);
    const el = screen.getByText('Hello');
    expect(el).toHaveClass('toast');
    expect(el).not.toHaveClass('toast-visible');
  });

  it('calls onDone after 2 seconds when visible', () => {
    const onDone = vi.fn();
    render(<Toast message="Hello" visible={true} onDone={onDone} />);

    expect(onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('does not set timer when not visible', () => {
    const onDone = vi.fn();
    render(<Toast message="Hello" visible={false} onDone={onDone} />);

    vi.advanceTimersByTime(3000);
    expect(onDone).not.toHaveBeenCalled();
  });
});
