'use client';

import { Component, type ReactNode } from 'react';

/** The lab shows its own errors in place, with the stack, instead of the app's generic error screen. */
export class LabBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <pre data-testid="lab-error" className="m-4 overflow-auto rounded-xl border border-red-400/40 bg-[#1E1A17] p-4 font-mono text-xs whitespace-pre-wrap text-[#F2EDE8]">
        {String(error.stack ?? error)}
      </pre>
    );
  }
}
