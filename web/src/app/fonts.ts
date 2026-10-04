import { Geist, Geist_Mono } from 'next/font/google';

/**
 * The two typefaces, declared once.
 *
 * There is no single root layout any more — the app and the public site each
 * have their own — and next/font must be called at module scope, so both
 * import these rather than declaring the fonts twice (which would ship the
 * same files under two hashes).
 */
export const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

export const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

/** The class pair every root `<html>` carries. */
export const fontVariables = `${geistSans.variable} ${geistMono.variable}`;
