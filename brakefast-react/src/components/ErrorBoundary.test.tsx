import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function ProblemChild(): JSX.Element {
  throw new Error('Test explosion');
}

describe('ErrorBoundary', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary label="Widget">
        <p>All good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('shows fallback message when a child throws', () => {
    render(
      <ErrorBoundary label="Widget">
        <ProblemChild />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Widget konnte nicht geladen werden')).toBeInTheDocument();
  });

  it('fallback has error-boundary-fallback class', () => {
    render(
      <ErrorBoundary label="Chart">
        <ProblemChild />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Chart konnte nicht geladen werden')).toHaveClass('section-error-fallback');
  });

  it('includes the label in the fallback text', () => {
    render(
      <ErrorBoundary label="Monitoring">
        <ProblemChild />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/Monitoring/)).toBeInTheDocument();
  });

  it('logs error to console.error', () => {
    render(
      <ErrorBoundary label="Widget">
        <ProblemChild />
      </ErrorBoundary>,
    );
    expect(consoleSpy).toHaveBeenCalled();
  });
});
