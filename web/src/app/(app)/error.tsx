'use client';

import type { ComponentProps } from 'react';
import RouteError from '@/components/route-error';
import { DesktopTitleBar } from '@/components/desktop-title-bar';

// Each root layout needs its own boundary: an error.tsx above a root layout
// would replace the <html> it renders. Errors in a root layout itself reach
// global-error.tsx.
//
// The desktop title bar too: the signed-in shell that carries it is inside the
// page that failed, so on Windows a crashed screen had no way to close the
// window. It renders nothing in a browser.
export default function AppError(props: ComponentProps<typeof RouteError>) {
  return (
    <div className="flex h-full flex-col">
      <DesktopTitleBar />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <RouteError {...props} />
      </div>
    </div>
  );
}
