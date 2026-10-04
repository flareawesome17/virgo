'use client';

// Each root layout needs its own boundary: an error.tsx above a root layout
// would replace the <html> it renders. Errors in a root layout itself reach
// global-error.tsx.
export { default } from '@/components/route-error';
