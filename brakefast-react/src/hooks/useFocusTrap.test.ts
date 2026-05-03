import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { useFocusTrap } from './useFocusTrap';

function createContainer(...children: HTMLElement[]) {
  const container = document.createElement('div');
  for (const child of children) {
    container.appendChild(child);
  }
  document.body.appendChild(container);
  return container;
}

function makeButton(className?: string) {
  const btn = document.createElement('button');
  if (className) btn.className = className;
  btn.textContent = className ?? 'button';
  return btn;
}

function fireKeyDown(key: string, opts: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, ...opts });
  vi.spyOn(event, 'preventDefault');
  document.dispatchEvent(event);
  return event;
}

describe('useFocusTrap', () => {
  let container: HTMLElement;

  afterEach(() => {
    container?.remove();
    document.body.style.overflow = '';
    vi.restoreAllMocks();
  });

  it('calls onClose when Escape pressed', () => {
    const closeBtn = makeButton('modal-close');
    const otherBtn = makeButton('other');
    container = createContainer(closeBtn, otherBtn);

    const onClose = vi.fn();
    renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      useFocusTrap(ref, onClose);
    });

    fireKeyDown('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('sets body overflow to hidden', () => {
    const closeBtn = makeButton('modal-close');
    container = createContainer(closeBtn);

    renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      useFocusTrap(ref, vi.fn());
    });

    expect(document.body.style.overflow).toBe('hidden');
  });

  it('restores body overflow on unmount', () => {
    const closeBtn = makeButton('modal-close');
    container = createContainer(closeBtn);

    const { unmount } = renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      useFocusTrap(ref, vi.fn());
    });

    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('focuses close button on mount', () => {
    const closeBtn = makeButton('modal-close');
    container = createContainer(closeBtn);

    renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      useFocusTrap(ref, vi.fn());
    });

    expect(document.activeElement).toBe(closeBtn);
  });

  it('traps Tab at last element (wraps to first)', () => {
    const first = makeButton('modal-close');
    const last = makeButton('last');
    container = createContainer(first, last);

    renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      useFocusTrap(ref, vi.fn());
    });

    last.focus();
    const event = fireKeyDown('Tab');
    expect(event.preventDefault).toHaveBeenCalled();
    expect(document.activeElement).toBe(first);
  });

  it('traps Shift+Tab at first element (wraps to last)', () => {
    const first = makeButton('modal-close');
    const last = makeButton('last');
    container = createContainer(first, last);

    renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      useFocusTrap(ref, vi.fn());
    });

    first.focus();
    const event = fireKeyDown('Tab', { shiftKey: true });
    expect(event.preventDefault).toHaveBeenCalled();
    expect(document.activeElement).toBe(last);
  });

  it('does nothing if containerRef is null', () => {
    const onClose = vi.fn();
    const { unmount } = renderHook(() => {
      const ref = useRef<HTMLElement | null>(null);
      useFocusTrap(ref, onClose);
    });

    // Body overflow should not be set
    expect(document.body.style.overflow).not.toBe('hidden');

    // Escape should not trigger onClose since no listener was added
    fireKeyDown('Escape');
    expect(onClose).not.toHaveBeenCalled();

    // Should not throw on unmount
    expect(() => unmount()).not.toThrow();
  });

  it('restores previous focus on unmount', () => {
    const outsideBtn = document.createElement('button');
    outsideBtn.textContent = 'outside';
    document.body.appendChild(outsideBtn);
    outsideBtn.focus();
    expect(document.activeElement).toBe(outsideBtn);

    const closeBtn = makeButton('modal-close');
    container = createContainer(closeBtn);

    const { unmount } = renderHook(() => {
      const ref = useRef<HTMLElement>(container);
      useFocusTrap(ref, vi.fn());
    });

    // Focus moved to close button
    expect(document.activeElement).toBe(closeBtn);

    unmount();

    // Focus restored to outside button
    expect(document.activeElement).toBe(outsideBtn);

    outsideBtn.remove();
  });
});
