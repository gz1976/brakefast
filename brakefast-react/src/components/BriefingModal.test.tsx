import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BriefingModal } from './BriefingModal';

const baseProps = {
  headline: 'Single Headline Without Pipes',
  onClose: vi.fn(),
};

describe('BriefingModal', () => {
  it('renders headline as title when no pipe delimiter', () => {
    render(<BriefingModal {...baseProps} />);
    expect(screen.getByText('Single Headline Without Pipes')).toBeInTheDocument();
  });

  it('splits headline into topic list when pipe delimiter present', () => {
    render(
      <BriefingModal
        {...baseProps}
        headline="KI-Revolution | Klimawandel | Sport"
      />,
    );
    expect(screen.getByText('Themen heute')).toBeInTheDocument();
    expect(screen.getByText('KI-Revolution')).toBeInTheDocument();
    expect(screen.getByText('Klimawandel')).toBeInTheDocument();
    expect(screen.getByText('Sport')).toBeInTheDocument();
  });

  it('shows "Ottos Briefing" badge', () => {
    render(<BriefingModal {...baseProps} />);
    expect(screen.getByText('Ottos Briefing')).toBeInTheDocument();
  });

  it('shows date when provided', () => {
    render(<BriefingModal {...baseProps} date="2026-03-28" />);
    // formatDate returns a German locale string; check the element exists
    const dateEl = document.querySelector('.modal-date');
    expect(dateEl).not.toBeNull();
    expect(dateEl!.textContent).toBeTruthy();
  });

  it('shows editorial text when provided', () => {
    render(
      <BriefingModal {...baseProps} editorial="Heute gibt es viel zu berichten." />,
    );
    expect(screen.getByText('Heute gibt es viel zu berichten.')).toBeInTheDocument();
  });

  it('hides editorial when not provided', () => {
    const { container } = render(<BriefingModal {...baseProps} />);
    expect(container.querySelector('.briefing-modal-text')).toBeNull();
  });

  it('calls onClose on overlay click', async () => {
    const onClose = vi.fn();
    const { container } = render(<BriefingModal {...baseProps} onClose={onClose} />);
    const overlay = container.querySelector('.modal-overlay')!;
    await userEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not close on content click', async () => {
    const onClose = vi.fn();
    const { container } = render(<BriefingModal {...baseProps} onClose={onClose} />);
    const content = container.querySelector('.modal-content')!;
    await userEvent.click(content);
    expect(onClose).not.toHaveBeenCalled();
  });
});
