import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 m-4 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-slate-200 space-y-3 shadow-xl">
          <div className="flex items-center gap-2.5 text-rose-400 font-semibold text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{this.props.fallbackTitle || 'Something went wrong rendering this component'}</span>
          </div>
          <p className="text-xs text-rose-200/80 leading-relaxed font-mono bg-rose-950/80 p-2.5 rounded-lg border border-rose-800/60 overflow-x-auto">
            {this.state.error?.message || 'Unknown render error'}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-slate-950 font-semibold text-xs transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Try Again</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
