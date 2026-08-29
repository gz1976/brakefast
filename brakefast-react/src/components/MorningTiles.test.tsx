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

  it('omits the word tile when word_of_day is missing', () => {
    const data = emptyData({ morning_tiles: mockData.morning_tiles });
    render(<MorningTiles data={data} />);
    expect(document.querySelector('.morning-tile-word')).not.toBeInTheDocument();
    expect(screen.queryByText('Heute kein Wort des Tages')).not.toBeInTheDocument();
  });

  it('does not render the retired streaming feed', () => {
    render(<MorningTiles data={mockData} />);
    expect(screen.queryByText('The Bear S3')).not.toBeInTheDocument();
  });

  it('does not render a streaming placeholder when no items exist', () => {
    render(<MorningTiles data={mockData} />);
    expect(screen.queryByText('Keine Streaming-Tipps heute')).not.toBeInTheDocument();
  });

  it('renders media tip', () => {
    render(<MorningTiles data={mockData} />);
    expect(screen.getByText('Podcast XY')).toBeInTheDocument();
    // "Spotify" is split across elements with adjacent text; query within the media meta div
    const metaDiv = document.querySelector('.morning-tile-media-meta')!;
    expect(metaDiv.textContent).toContain('Spotify');
  });

  it('omits the media tile when no tip exists', () => {
    const data = {
      ...mockData,
      morning_tiles: { ...mockData.morning_tiles, media_tip: undefined },
    } as NewspaperData;
    render(<MorningTiles data={data} />);
    expect(document.querySelector('.morning-tile-media')).not.toBeInTheDocument();
    expect(screen.queryByText('Kein Tipp heute')).not.toBeInTheDocument();
  });

  it('renders events', () => {
    render(<MorningTiles data={mockData} />);
    expect(screen.getByText('Konzert')).toBeInTheDocument();
  });

  it('shows the current regional events empty state when no events exist', () => {
    const data = {
      ...mockData,
      morning_tiles: { ...mockData.morning_tiles, events: [] },
    } as NewspaperData;
    render(<MorningTiles data={data} />);
    expect(screen.getByText('Keine Events im Bezirk Voitsberg verf\u00fcgbar')).toBeInTheDocument();
  });
});
