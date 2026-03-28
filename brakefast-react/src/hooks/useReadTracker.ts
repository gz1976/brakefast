import { useCallback, useState } from 'react';

const STORAGE_KEY = 'brakefast-read-items';

function toItemKey(link: string, title?: string) {
  return `${link.trim()}::${(title || '').trim()}`;
}

export function useReadTracker() {
  const [readItems, setReadItems] = useState<Set<string>>(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return new Set<string>();

      const parsed = JSON.parse(raw) as string[];
      if (Array.isArray(parsed)) {
        return new Set(parsed);
      }
    } catch {
      // Ignore invalid local state and start fresh.
    }
    return new Set<string>();
  });

  const markAsRead = useCallback((link: string, title?: string) => {
    const key = toItemKey(link, title);
    if (!key.trim()) return;

    setReadItems((current) => {
      const next = new Set(current);
      next.add(key);

      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // Ignore storage failures, e.g. private mode quotas.
      }

      return next;
    });
  }, []);

  const isRead = useCallback((link: string, title?: string) => {
    return readItems.has(toItemKey(link, title));
  }, [readItems]);

  return { markAsRead, isRead };
}
