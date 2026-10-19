import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';

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

/**
 * The film-title serif for virgo.ph only (05-cinema.md, the polish pass): the
 * headline, the chapter headings and the subtitles. The app never loads it.
 */
export const displaySerif = Instrument_Serif({
  variable: '--font-display',
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
});
