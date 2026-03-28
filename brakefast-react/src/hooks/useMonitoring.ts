import { useState, useEffect } from 'react';
import { z } from 'zod';
import type { MonitoringData } from '../types';
import { MonitoringDataSchema } from '../utils/schemas';

export function useMonitoring() {
  const [data, setData] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = import.meta.env.DEV
      ? '/sample-monitoring.json'
      : '/latest/monitoring.json';

    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: unknown) => {
        const result = z.safeParse(MonitoringDataSchema, json);
        if (!result.success) {
          console.error('Monitoring validation failed:', result.error.issues);
          setError('Monitoring-Datenformat ungueltig');
          setLoading(false);
          return;
        }
        setData(result.data as MonitoringData);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
        setLoading(false);
      });
  }, []);

  return { data, loading, error };
}
