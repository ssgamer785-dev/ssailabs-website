import { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Last line of defence for the showroom suite.
 *
 * A single unexpected value (a hand-edited backup, a legacy record missing a
 * field) used to unmount the whole React tree and leave a blank white screen.
 * This boundary keeps the Regency Tailor branding on screen, explains what
 * happened, and offers a recovery route that never destroys data.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[RegencyTailors] Unrecoverable render error:', error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen w-full bg-[#F7F3EA] text-[#071426] flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white rounded-2xl border-2 border-[#C9A24A]/50 shadow-lg p-8 space-y-5">
          <div>
            <div className="text-[10px] font-bold tracking-[0.2em] text-[#C9A24A] uppercase mb-1">
              REGENCY TAILOR
            </div>
            <h1 className="text-2xl font-extrabold text-[#071426]">Something went wrong</h1>
          </div>

          <p className="text-sm text-[#4A5568] leading-relaxed">
            The showroom suite hit an unexpected problem while displaying this screen.
            <strong className="text-[#071426]"> Your saved data has not been changed.</strong> Reloading
            usually clears it. If it keeps happening, export a backup from Backup &amp; Recovery and send
            it to support along with the details below.
          </p>

          <details className="bg-[#FAF8F5] border border-[#E0D8CB] rounded-xl p-3">
            <summary className="text-xs font-bold text-[#8C7E6A] uppercase tracking-wider cursor-pointer">
              Technical details
            </summary>
            <pre className="mt-2 text-[11px] text-[#4A5568] whitespace-pre-wrap break-words">
              {error.message}
            </pre>
          </details>

          <button
            onClick={this.handleReload}
            className="px-5 py-2.5 bg-[#071426] hover:bg-[#0B1930] text-[#D4AF5A] font-extrabold text-xs rounded-xl uppercase tracking-wider cursor-pointer"
          >
            Reload Showroom Suite
          </button>
        </div>
      </div>
    );
  }
}
