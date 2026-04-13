import { useState, useEffect } from 'react';
import { z } from 'zod';
import type { MonitoringData } from '../types';
import { MonitoringDataSchema } from '../utils/schemas';

export function useMonitoring() {
  const [data, setData] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const urls = import.meta.env.DEV
      ? ['/latest/monitoring.json', '/local-monitoring.json', '/sample-monitoring.json']
      : ['/latest/monitoring.json', '/monitoring.json'];

    const load = async () => {
      try {
        let lastError = '';
        for (const url of urls) {
          try {
            const response = await fetch(url);
            if (!response.ok) continue;
            const json = await response.json();
            const result = z.safeParse(MonitoringDataSchema, json);
            if (!result.success) {
              lastError = 'Monitoring-Datenformat ungueltig';
              console.error('Monitoring validation failed:', result.error.issues);
              continue;
            }
            setData(result.data as MonitoringData);
            setLoading(false);
            return;
          } catch {
            continue;
          }
        }

        throw new Error(lastError || 'Keine Monitoring-Daten gefunden');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
        setLoading(false);
      }
    };

    void load();
  }, []);

  return { data, loading, error };
}
