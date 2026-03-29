import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useActiveSection } from './useActiveSection';

type ObserverCallback = (entries: Array<{ isIntersecting: boolean; target: { id: string } }>) => void;

let observerCallback: ObserverCallback;
const observeMock = vi.fn();
const disconnectMock = vi.fn();

class MockIntersectionObserver {
  constructor(callback: ObserverCallback, public options: IntersectionObserverInit) {
    MockIntersectionObserver.lastOptions = options;
    observerCallback = callback;
  }
  static lastOptions: IntersectionObserverInit | undefined;
  observe = observeMock;
  unobserve = vi.fn();
  disconnect = disconnectMock;
  root = null;
  rootMargin = '';
  thresholds: number[] = [];
  takeRecords = vi.fn(() => []);
}

describe('useActiveSection', () => {
  beforeEach(() => {
    observeMock.mockClear();
    disconnectMock.mockClear();
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns first sectionId as initial activeId', () => {
    const { result } = renderHook(() => useActiveSection(['section-a', 'section-b']));
    expect(result.current.activeId).toBe('section-a');
  });

  it('returns empty string for empty sectionIds', () => {
    const { result } = renderHook(() => useActiveSection([]));
    expect(result.current.activeId).toBe('');
  });

  it('creates IntersectionObserver with correct options', () => {
    renderHook(() => useActiveSection(['sec-1']));
    expect(MockIntersectionObserver.lastOptions).toEqual({
      rootMargin: '-80px 0px -60% 0px',
      threshold: 0,
    });
  });

  it('observes DOM elements matching sectionIds', () => {
    const el1 = document.createElement('div');
    el1.id = 'sec-1';
    const el2 = document.createElement('div');
    el2.id = 'sec-2';
    document.body.append(el1, el2);

    renderHook(() => useActiveSection(['sec-1', 'sec-2']));

    expect(observeMock).toHaveBeenCalledTimes(2);
    expect(observeMock).toHaveBeenCalledWith(el1);
    expect(observeMock).toHaveBeenCalledWith(el2);

    el1.remove();
    el2.remove();
  });

  it('updates activeId when entry is intersecting', () => {
    const el = document.createElement('div');
    el.id = 'sec-x';
    document.body.appendChild(el);

    const { result } = renderHook(() => useActiveSection(['sec-x']));

    act(() => {
      observerCallback([{ isIntersecting: true, target: { id: 'sec-x' } }]);
    });

    expect(result.current.activeId).toBe('sec-x');

    el.remove();
  });

  it('disconnects observer on unmount', () => {
    const { unmount } = renderHook(() => useActiveSection(['sec-1']));
    unmount();
    expect(disconnectMock).toHaveBeenCalledTimes(1);
  });

  it('scrollTo calls scrollIntoView on element', () => {
    const el = document.createElement('div');
    el.id = 'scroll-target';
    el.scrollIntoView = vi.fn();
    document.body.appendChild(el);

    const { result } = renderHook(() => useActiveSection(['scroll-target']));
    result.current.scrollTo('scroll-target');

    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });

    el.remove();
  });

  it('scrollTo does nothing if element not found', () => {
    const { result } = renderHook(() => useActiveSection(['missing']));
    // Should not throw
    expect(() => result.current.scrollTo('nonexistent')).not.toThrow();
  });
});
