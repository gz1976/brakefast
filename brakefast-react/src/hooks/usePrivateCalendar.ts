import { useEffect, useState } from 'react';
import type { PrivateCalendarEvent } from '../types';

const STORAGE_KEY = 'brakefast-private-key';
const URL_PARAM = 'k';
const PRIVATE_URL = '/private/calendar.json';

/**
 * Unlocks the full calendar titles & locations behind a shared secret.
 *
 * Flow:
 * 1. First load with `?k=XXX` → secret is cached in localStorage and the
 *    query param is stripped from the URL so it's not visible/bookmarkable
 *    with the key exposed.
 * 2. All subsequent visits on the same device fetch `/private/calendar.json?k=XXX`
 *    automatically and merge private titles into the calendar widget.
 * 3. If nginx returns 401/403/404 (key wrong or endpoint missing), the
 *    redacted public events remain in place — no titles leak.
 *
 * This is NOT cryptographic privacy — anyone with the key URL has full read.
 * It is "casual visitor cannot see private titles" privacy.
 */
export function usePrivateCalendar() {
  const [events, setEvents] = useState<PrivateCalendarEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let key = '';
    try {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get(URL_PARAM);
      if (fromUrl) {
        key = fromUrl;
        window.localStorage.setItem(STORAGE_KEY, fromUrl);
        // Remove ?k=... from visible URL so the key doesn't linger in history / screenshots.
        params.delete(URL_PARAM);
        const newSearch = params.toString();
        const newUrl =
          window.location.pathname +
          (newSearch ? `?${newSearch}` : '') +
          window.location.hash;
        window.history.replaceState(null, '', newUrl);
      } else {
        key = window.localStorage.getItem(STORAGE_KEY) || '';
      }
    } catch {
      // localStorage disabled (private mode etc.) — we'll just stay redacted.
      key = '';
    }

    if (!key) {
      setEvents(null);
      return;
    }

    let cancelled = false;
    const fetchPrivate = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${PRIVATE_URL}?k=${encodeURIComponent(key)}`, {
          cache: 'no-store',
          credentials: 'omit',
        });
        if (!res.ok) {
          // 401/403 → cached key is stale or revoked; drop it so we don't keep retrying.
          if (res.status === 401 || res.status === 403) {
            try {
              window.localStorage.removeItem(STORAGE_KEY);
            } catch {
              // ignore
            }
          }
          throw new Error(`HTTP ${res.status}`);
        }
        const payload = await res.json();
        if (!cancelled && Array.isArray(payload)) {
          setEvents(payload);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setEvents(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchPrivate();
    return () => {
      cancelled = true;
    };
  }, []);

  return { privateEvents: events, loading, error };
}
