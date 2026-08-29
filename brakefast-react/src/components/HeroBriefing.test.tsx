import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeroBriefing } from './HeroBriefing';
import type { NewspaperData } from '../types';

const mockData: NewspaperData = {
  generated: '2026-03-28T06:00:00Z',
  totalArticles: 5,
  headline: 'Test Headline',
  editorial: 'Test editorial text',
  categories: {
    ai: {
      name: 'AI',
      emoji: '🤖',
      css_class: 'ai',
      articles: [
        {
          title: 'Top AI Story',
          link: 'https://ai.test/1',
          description: 'AI description text',
          date: '2026-03-28',
          source: 'AI Source',
          relevance_score: 95,
          image: '',
        },
      ],
    },
  },
  widgets: {
    weather: {
      temp: 15,
      description: 'Sunny',
      feelsLike: 13,
      min: 10,
      max: 20,
      location: 'Voitsberg',
    },
    dayInfo: {
      sunrise: '06:30 AM',
      sunset: '07:00 PM',
      namenstag: 'Test',
    },
  },
  morning_tiles: {
    headlines: [
      { text: 'Headline One', source: 'Source A', summary: 'Summary A' },
      { text: 'Headline Two', source: 'Source B' },
    ],
  },
};

describe('HeroBriefing', () => {
  it('renders weather information when weather widget is present', () => {
    render(<HeroBriefing data={mockData} calendarRevealed={false} />);
    expect(screen.getByText(/Voitsberg/)).toBeInTheDocument();
    expect(screen.getAllByText(/15°C/).length).toBeGreaterThan(0);
  });

  it('renders top story title from data', () => {
    render(<HeroBriefing data={mockData} calendarRevealed={false} />);
    expect(screen.getByText('Top AI Story')).toBeInTheDocument();
  });

  it('renders headlines list', () => {
    render(<HeroBriefing data={mockData} calendarRevealed={false} />);
    expect(screen.getByText('Headline One')).toBeInTheDocument();
    expect(screen.getByText('Headline Two')).toBeInTheDocument();
  });

  it('does not crash when widgets are missing (empty data)', () => {
    const emptyData: NewspaperData = {
      generated: '2026-03-28T06:00:00Z',
      totalArticles: 0,
      categories: {},
    };
    expect(() => {
      render(<HeroBriefing data={emptyData} calendarRevealed={false} />);
    }).not.toThrow();
  });

  it('does not render the retired editorial banner', () => {
    render(<HeroBriefing data={mockData} calendarRevealed={false} />);
    expect(screen.queryByText('Test editorial text')).not.toBeInTheDocument();
  });

  it('shows "Wetter nicht verfügbar" when weather widget is missing', () => {
    const noWeather: NewspaperData = {
      ...mockData,
      widgets: {},
    };
    render(<HeroBriefing data={noWeather} calendarRevealed={false} />);
    expect(screen.getAllByText(/Wetter nicht verfügbar/).length).toBeGreaterThan(0);
  });
});
