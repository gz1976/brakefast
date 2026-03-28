import { useEffect } from 'react';

interface Props {
  message: string;
  visible: boolean;
  onDone: () => void;
}

export function Toast({ message, visible, onDone }: Props) {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onDone, 2000);
    return () => clearTimeout(timer);
  }, [visible, onDone]);

  return (
    <div className={`toast${visible ? ' toast-visible' : ''}`}>
      {message}
    </div>
  );
}
