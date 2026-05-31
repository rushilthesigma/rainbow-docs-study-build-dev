import { Component } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

// Catches render-time crashes in the subtree so one broken component
// (e.g., a slide layout) doesn't blank the entire desktop shell.
// Wrap routes and each windowed app in its own boundary.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Surface to console for dev; in prod this is where a telemetry
    // hook would go (open question in PRD - left as plain console).
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) {
      return this.props.fallback(this.state.error, this.reset);
    }
    return (
      <div
        role="alert"
        className="flex flex-col items-center justify-center gap-3 p-6 m-4 rounded-2xl border border-rose-400/20 bg-rose-500/[0.06] text-white/85"
      >
        <AlertTriangle size={28} className="text-rose-300/80" />
        <div className="text-center">
          <div className="text-sm font-semibold text-white/90">
            {this.props.label || 'Something went wrong'}
          </div>
          <div className="text-xs text-white/55 mt-1 max-w-md break-words">
            {this.state.error?.message || 'Unexpected error'}
          </div>
        </div>
        <button
          onClick={this.reset}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] text-white/85 transition-colors"
        >
          <RotateCcw size={12} />
          Try again
        </button>
      </div>
    );
  }
}
