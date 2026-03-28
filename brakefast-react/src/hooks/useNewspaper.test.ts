import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useNewspaper } from './useNewspaper';

const validData = {
  generated: '2026-01-01T00:00:00Z',
  totalArticles: 1,
  categories: {
    test: {
      name: 'Test',
      emoji: 'T',
      css_class: 'test',
      articles: [
        { title: 'Article One', link: 'http://x.com/a', description: 'Desc', date: '2026-01-01', source: 'S' },
      ],
    },
  },
};

/** Create a fresh Response for each fetch call so .json() can be consumed multiple times */
function mockFetchReturning(data: unknown) {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })),
  );
}

function mockFetchRejecting(message: string) {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
    Promise.reject(new Error(message)),
  );
}

describe('useNewspaper', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '', href: 'http://localhost/' },
      writable: true,
    });
  });

  it('returns loading=true initially then loading=false after fetch resolves', async () => {
    mockFetchReturning(validData);
    const { result } = renderHook(() => useNewspaper());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('sets data when fetch returns valid JSON', async () => {
    mockFetchReturning(validData);
    const { result } = renderHook(() => useNewspaper());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).not.toBeNull();
    expect(result.current.data!.totalArticles).toBeGreaterThanOrEqual(1);
    expect(result.current.data!.categories['test'].articles).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('sets error when fetch fails', async () => {
    mockFetchRejecting('Network error');
    const { result } = renderHook(() => useNewspaper());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
    expect(result.current.data).toBeNull();
  });

  it('sets error when Zod validation fails on non-object response', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve(new Response('42', { status: 200, headers: { 'Content-Type': 'application/json' } })),
    );
    const { result } = renderHook(() => useNewspaper());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
  });

  it('deduplicates articles after validation', async () => {
    const dataWithDups = {
      ...validData,
      totalArticles: 2,
      categories: {
        test: {
          name: 'Test',
          emoji: 'T',
          css_class: 'test',
          articles: [
            { title: 'A1', link: 'http://x.com/a', description: 'D', date: '2026-01-01', source: 'S', content_quality: 'low' },
            { title: 'A2', link: 'http://x.com/a/', description: 'D', date: '2026-01-01', source: 'S', content_quality: 'high' },
          ],
        },
      },
    };
    mockFetchReturning(dataWithDups);
    const { result } = renderHook(() => useNewspaper());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).not.toBeNull();
    expect(result.current.data!.categories['test'].articles).toHaveLength(1);
    expect(result.current.data!.categories['test'].articles[0].content_quality).toBe('high');
  });
});
