'use client';

// Each root layout needs its own boundary: an error.tsx above a root layout
// would replace the <html> it renders. Errors in a root layout itself reach
// global-error.tsx.
//
// It renders inside the (app) layout, and so inside the shell: a screen that
// fails keeps the sidebar, the bar and the desktop title bar around it.
export { default } from '@/components/route-error';
