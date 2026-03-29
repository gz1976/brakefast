import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NavTabs } from './NavTabs';

const sections = [
  { id: 'tech', label: 'Technologie' },
  { id: 'science', label: 'Wissenschaft' },
  { id: 'sports', label: 'Sport' },
];

describe('NavTabs', () => {
  it('renders all section labels', () => {
    render(<NavTabs sections={sections} activeId="tech" onNavigate={vi.fn()} />);

    expect(screen.getByText('Technologie')).toBeInTheDocument();
    expect(screen.getByText('Wissenschaft')).toBeInTheDocument();
    expect(screen.getByText('Sport')).toBeInTheDocument();
  });

  it('marks the active section with active class', () => {
    render(<NavTabs sections={sections} activeId="science" onNavigate={vi.fn()} />);

    expect(screen.getByText('Wissenschaft')).toHaveClass('active');
    expect(screen.getByText('Technologie')).not.toHaveClass('active');
    expect(screen.getByText('Sport')).not.toHaveClass('active');
  });

  it('calls onNavigate with section id on click', () => {
    const onNavigate = vi.fn();
    render(<NavTabs sections={sections} activeId="tech" onNavigate={onNavigate} />);

    fireEvent.click(screen.getByText('Sport'));
    expect(onNavigate).toHaveBeenCalledWith('sports');
  });

  it('renders no buttons with empty sections array', () => {
    render(<NavTabs sections={[]} activeId="" onNavigate={vi.fn()} />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
