import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MorningTiles } from './MorningTiles';
import type { NewspaperData } from '../types';

const mockData = {
  widgets: {
    word_of_day: { word: 'Serendipität', explanation: 'Glücklicher Zufall', origin: 'Englisch' },
    weather: { temp: 15, condition: 'Sonnig', icon: '☀️', location: 'Voitsberg' },
  },
  morning_tiles: {
    streaming: [
      { title: 'The Bear S3', platform: 'Disney+', type: 'Serie', url: 'https://example.com/bear' },
    ],
    media_tip: { title: 'Podcast XY', type: 'Podcast', source: 'Spotify', duration: '45 min' },
    events: [
      { title: 'Konzert', date: '2026-03-30', location: 'Graz', type: 'Musik' },
    ],
    headlines: [],
  },
  categories: {},
} as NewspaperData;

function emptyData(overrides: Partial<NewspaperData> = {}): NewspaperData {
  return {
    widgets: {},
    morning_tiles: {
      streaming: [],
      media_tip: undefined,
      events: [],
      headlines: [],
    },
    categories: {},
    ...overrides,
    totalArticles: 0,
  } as NewspaperData;
}

describe('MorningTiles', () => {
  it('renders "Wort des Tages" tile with word and explanation', () => {
    render(<MorningTiles data={mockData} />);
    expect(screen.getByText('Wort des Tages')).toBeInTheDocument();
    expect(screen.getByText('Serendipität')).toBeInTheDocument();
    expect(screen.getByText('Glücklicher Zufall')).toBeInTheDocument();
  });

  it('shows empty state when word_of_day missing', () => {
    render(<MorningTiles data={emptyData()} />);
    expect(screen.getByText('Heute kein Wort des Tages')).toBeInTheDocument();
  });

  it('renders streaming items', () => {
    render(<MorningTiles data={mockData} />);
    expect(screen.getByText('The Bear S3')).toBeInTheDocument();
  });

  it('shows streaming empty state when no items', () => {
    render(<MorningTiles data={emptyData()} />);
    expect(screen.getByText('Keine Streaming-Tipps heute')).toBeInTheDocument();
  });

  it('renders media tip', () => {
    render(<MorningTiles data={mockData} />);
    expect(screen.getByText('Podcast XY')).toBeInTheDocument();
    // "Spotify" is split across elements with adjacent text; query within the media meta div
    const metaDiv = document.querySelector('.morning-tile-media-meta')!;
    expect(metaDiv.textContent).toContain('Spotify');
  });

  it('shows media tip empty state when missing', () => {
    render(<MorningTiles data={emptyData()} />);
    expect(screen.getByText('Kein Tipp heute')).toBeInTheDocument();
  });

  it('renders events', () => {
    render(<MorningTiles data={mockData} />);
    expect(screen.getByText('Konzert')).toBeInTheDocument();
  });

  it('shows events empty state when no events', () => {
    render(<MorningTiles data={emptyData()} />);
    expect(screen.getByText('Keine Events diese Woche')).toBeInTheDocument();
  });
});
