import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DetailModal } from './DetailModal';

const baseProps = {
  title: 'Test Detail Title',
  onClose: vi.fn(),
};

describe('DetailModal', () => {
  it('renders title', () => {
    render(<DetailModal {...baseProps} />);
    expect(screen.getByText('Test Detail Title')).toBeInTheDocument();
  });

  it('shows source badge when provided', () => {
    render(<DetailModal {...baseProps} source="Reuters" />);
    expect(screen.getByText('Reuters')).toBeInTheDocument();
  });

  it('hides source badge when not provided', () => {
    const { container } = render(<DetailModal {...baseProps} />);
    expect(container.querySelector('.modal-source')).toBeNull();
  });

  it('shows text content', () => {
    render(<DetailModal {...baseProps} text="Some detail text" />);
    expect(screen.getByText('Some detail text')).toBeInTheDocument();
  });

  it('shows fallback text when no text provided', () => {
    render(<DetailModal {...baseProps} />);
    expect(screen.getByText('Keine weiteren Details verfügbar.')).toBeInTheDocument();
  });

  it('shows original link when URL provided', () => {
    render(<DetailModal {...baseProps} url="https://example.com/article" />);
    const link = screen.getByText('Original öffnen →');
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute('href', 'https://example.com/article');
    expect(link.closest('a')).toHaveAttribute('target', '_blank');
  });

  it('hides link when no URL', () => {
    render(<DetailModal {...baseProps} />);
    expect(screen.queryByText('Original öffnen →')).not.toBeInTheDocument();
  });

  it('calls onClose on overlay click', async () => {
    const onClose = vi.fn();
    const { container } = render(<DetailModal {...baseProps} onClose={onClose} />);
    const overlay = container.querySelector('.modal-overlay')!;
    await userEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose from the newspaper close button', async () => {
    const onClose = vi.fn();
    render(<DetailModal {...baseProps} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on content click (stopPropagation)', async () => {
    const onClose = vi.fn();
    const { container } = render(<DetailModal {...baseProps} onClose={onClose} />);
    const content = container.querySelector('.modal-content')!;
    await userEvent.click(content);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders HTML content when html=true and strips dangerous tags', () => {
    const dirtyHtml = 'Safe content<script>alert("xss")</script><strong>Bold</strong>';
    const { container } = render(
      <DetailModal {...baseProps} text={dirtyHtml} html />,
    );
    const textDiv = container.querySelector('.modal-text')!;
    expect(textDiv.textContent).toContain('Safe content');
    expect(textDiv.textContent).toContain('Bold');
    // sanitizeHtml strips script tags but keeps strong/em/a/br
    expect(textDiv.innerHTML).toContain('<strong>');
    expect(textDiv.innerHTML).not.toContain('<script');
  });
});
