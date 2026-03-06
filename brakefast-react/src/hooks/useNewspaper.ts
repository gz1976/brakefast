import { useState, useEffect } from 'react';
import type { NewspaperData } from '../types';

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
        if (article.reading_time_minutes) {
          totalMinutes += article.reading_time_minutes;
        } else {
          const words = (article.summary || article.description || '').split(/\s+/).length;
          totalMinutes += Math.max(1, Math.round(words / 200));
        }
      }
    }
    data.reading_time_total = totalMinutes;
  }

  return data;
}

export function useNewspaper() {
  const [data, setData] = useState<NewspaperData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = import.meta.env.DEV
      ? '/sample-data.json'
      : '/latest/data.json';

    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: NewspaperData) => {
        setData(normalizeData(json));
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return { data, loading, error };
}
