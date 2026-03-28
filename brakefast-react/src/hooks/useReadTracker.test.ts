import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReadTracker } from './useReadTracker';

const STORAGE_KEY = 'brakefast-read-items';

/**
 * jsdom in vitest may not provide a proper localStorage implementation.
 * We create a simple in-memory mock and attach it to window.
 */
function createMockLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { store.set(key, value); }),
    removeItem: vi.fn((key: string) => { store.delete(key); }),
    clear: vi.fn(() => { store.clear(); }),
    get length() { return store.size; },
    key: vi.fn(() => null),
    _store: store,
  };
}

describe('useReadTracker', () => {
  let mockStorage: ReturnType<typeof createMockLocalStorage>;
  let originalLocalStorage: Storage;

  beforeEach(() => {
    originalLocalStorage = window.localStorage;
    mockStorage = createMockLocalStorage();
    Object.defineProperty(window, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it('returns false for unknown items', () => {
    const { result } = renderHook(() => useReadTracker());
    expect(result.current.isRead('https://example.com/unknown', 'Title')).toBe(false);
  });

  it('returns true after markAsRead is called', () => {
    const { result } = renderHook(() => useReadTracker());
    act(() => {
      result.current.markAsRead('https://example.com/article', 'Test Title');
    });
    expect(result.current.isRead('https://example.com/article', 'Test Title')).toBe(true);
  });

  it('persists read state to localStorage', () => {
    const { result } = renderHook(() => useReadTracker());
    act(() => {
      result.current.markAsRead('https://example.com/article', 'Test Title');
    });
    expect(mockStorage.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      expect.stringContaining('https://example.com/article::Test Title'),
    );
  });

  it('initializes from existing localStorage data on mount', () => {
    mockStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(['https://example.com/saved::Saved Title']),
    );
    const { result } = renderHook(() => useReadTracker());
    expect(result.current.isRead('https://example.com/saved', 'Saved Title')).toBe(true);
  });

  it('handles localStorage write errors gracefully without throwing', () => {
    mockStorage.setItem.mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    const { result } = renderHook(() => useReadTracker());
    expect(() => {
      act(() => {
        result.current.markAsRead('https://example.com/article', 'Title');
      });
    }).not.toThrow();
  });
});
