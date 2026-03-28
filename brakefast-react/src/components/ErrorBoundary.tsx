import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props {
  label: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/** Section-level error boundary. Collapses to a single German error line on render failure. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.label}] render error:`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="section-error-fallback">
          {this.props.label} konnte nicht geladen werden
        </div>
      );
    }
    return this.props.children;
  }
}
