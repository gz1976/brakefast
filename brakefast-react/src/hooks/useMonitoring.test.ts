import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMonitoring } from './useMonitoring';

const VALID_MONITORING = {
  generated: '2026-01-01T00:00:00Z',
  period: '7d',
  agents: {
    main: { model: 'gpt-4', status: 'active', sessions_total: 10 },
    worker: { model: 'gpt-3.5', status: 'active', sessions_total: 5 },
    expert: { model: 'claude', status: 'idle', sessions_total: 2 },
  },
  activity_7d: [],
  costs: { today_usd: 1.5, month_usd: 30, daily_limit_usd: 10, monthly_limit_usd: 100, history_7d: [] },
  routing: [],
  models: [],
  system: { disk_percent: 45, uptime: '5d', containers: 3, last_heartbeat: '', last_audit: '', heartbeat_status: 'ok' },
  recent_events: [],
};

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

function mockFetchSequence(responses: Array<{ status: number; data?: unknown }>) {
  const fn = globalThis.fetch as ReturnType<typeof vi.fn>;
  for (const resp of responses) {
    if (resp.status === 200) {
      fn.mockImplementationOnce(() =>
        Promise.resolve(new Response(JSON.stringify(resp.data), { status: 200, headers: { 'Content-Type': 'application/json' } })),
      );
    } else {
      fn.mockImplementationOnce(() =>
        Promise.resolve(new Response('', { status: resp.status })),
      );
    }
  }
}

describe('useMonitoring', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with loading true and no data or error', () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useMonitoring());
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('sets data on valid response', async () => {
    mockFetchReturning(VALID_MONITORING);
    const { result } = renderHook(() => useMonitoring());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).not.toBeNull();
    expect(result.current.data?.period).toBe('7d');
    expect(result.current.data?.agents.main.model).toBe('gpt-4');
    expect(result.current.error).toBeNull();
  });

  it('sets error on fetch failure', async () => {
    mockFetchRejecting('Network error');
    const { result } = renderHook(() => useMonitoring());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.data).toBeNull();
  });

  it('sets error on Zod validation failure', async () => {
    // Pass data that will fail Zod validation -- a non-object value
    mockFetchReturning('not-an-object');
    const { result } = renderHook(() => useMonitoring());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Monitoring-Datenformat ungueltig');
    expect(result.current.data).toBeNull();
  });

  it('tries next URL if first returns 404', async () => {
    mockFetchSequence([
      { status: 404 },
      { status: 200, data: VALID_MONITORING },
    ]);
    const { result } = renderHook(() => useMonitoring());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).not.toBeNull();
    expect(result.current.data?.period).toBe('7d');
    expect(result.current.error).toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
