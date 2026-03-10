import { useState, useEffect } from 'react';
import type { ArchiveEdition, ArchiveIndex, NewspaperData } from '../types';
import { getReadingTime } from '../utils/textUtils';

function normalizeData(raw: NewspaperData): NewspaperData {
  const data = { ...raw };

  // Ensure widgets object exists
  if (!data.widgets) {
    data.widgets = {};
  }

  // Parse legacy weather string into structured weather if needed
  if (data.weather && !data.widgets.weather) {
    const tempMatch = data.weather.match(/([+-]?\d+)°/);
    const temp = tempMatch ? parseInt(tempMatch[1], 10) : 0;
    const desc = data.weather.replace(/^[^:]+:\s*/, '').replace(/[+-]?\d+°C?,?\s*/, '').trim();
    data.widgets.weather = {
      temp,
      description: desc || data.weather,
      feelsLike: temp - 2,
      min: temp - 2,
      max: temp + 5,
      icon: temp > 20 ? '☀️' : temp > 5 ? '⛅' : '🌤',
      location: 'Voitsberg',
    };
  }

  // Fallback for missing generated timestamp
  if (!data.generated) {
    data.generated = new Date().toISOString();
  }

  // Fallback for missing totalArticles
  if (!data.totalArticles) {
    data.totalArticles = Object.values(data.categories).reduce(
      (sum, cat) => sum + cat.articles.length, 0
    );
  }

  // Calculate total reading time if missing
  if (!data.reading_time_total) {
    let totalMinutes = 0;
    for (const cat of Object.values(data.categories)) {
      for (const article of cat.articles) {
        const rt = getReadingTime(
          article.summary || article.description,
          article.reading_time_minutes,
        );
        if (rt) totalMinutes += rt;
      }
    }
    data.reading_time_total = totalMinutes;
  }

  return data;
}

function getEditionFromLocation(): string | null {
  const params = new URLSearchParams(window.location.search);
  const edition = params.get('edition');
  return edition && edition.trim() ? edition.trim() : null;
}

function getArchiveIndexUrls(): string[] {
  return import.meta.env.DEV
    ? ['/archive-index.json']
    : ['/legacy/archive-index.json'];
}

function getDefaultDataUrls(): string[] {
  return import.meta.env.DEV
    ? ['/local-data.json', '/sample-data.json']
    : ['/latest/data.json'];
}

function getEditionFallbackUrls(edition: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(edition)) {
    return getDefaultDataUrls();
  }

  const [year, month, day] = edition.split('-');
  return import.meta.env.DEV
    ? [`/time-machine/${edition}.json`, '/local-data.json', '/sample-data.json']
    : [`/legacy/${year}/${month}/${day}/data.json`, '/latest/data.json'];
}

export function useNewspaper() {
  const [data, setData] = useState<NewspaperData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [archiveEditions, setArchiveEditions] = useState<ArchiveEdition[]>([]);
  const [selectedEdition, setSelectedEdition] = useState<string | null>(() => getEditionFromLocation());

  useEffect(() => {
    const handlePopState = () => setSelectedEdition(getEditionFromLocation());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const loadArchiveIndex = async () => {
      try {
        for (const url of getArchiveIndexUrls()) {
          const response = await fetch(url);
          if (!response.ok) continue;
          const json = await response.json() as ArchiveIndex;
          const editions = Array.isArray(json.editions) ? json.editions : [];
          setArchiveEditions(editions);
          return;
        }
      } catch {
        setArchiveEditions([]);
      }
    };

    void loadArchiveIndex();
  }, []);

  useEffect(() => {
    const archivedMatch = selectedEdition
      ? archiveEditions.find((edition) => edition.date === selectedEdition)
      : undefined;
    const urls = selectedEdition
      ? [archivedMatch?.data_url, ...getEditionFallbackUrls(selectedEdition)].filter(
          (value): value is string => Boolean(value),
        )
      : getDefaultDataUrls();

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        for (const url of urls) {
          const response = await fetch(url);
          if (!response.ok) continue;
          const json = await response.json();
          setData(normalizeData(json as NewspaperData));
          setLoading(false);
          return;
        }

        throw new Error('Keine Zeitungdaten gefunden');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
        setLoading(false);
      }
    };

    void load();
  }, [archiveEditions, selectedEdition]);

  const goToLatest = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('edition');
    window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
    setSelectedEdition(null);
  };

  const goToEdition = (edition: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('edition', edition);
    window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
    setSelectedEdition(edition);
  };

  return {
    data,
    loading,
    error,
    archiveEditions,
    selectedEdition,
    goToLatest,
    goToEdition,
  };
}
