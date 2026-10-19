import { headers } from 'next/headers';
import { cache } from 'react';
import type { PublicShowcase, ShowcasePiece } from '@/api';
import { API_BASE_URL } from '@/api/config';

/**
 * The public page behind a shared link: reading the post, and the few things
 * the page and its preview both work out from it.
 */

/** The public site, for the page's own address and the links off it. */
export const SITE = (process.env.NEXT_PUBLIC_SITE_ORIGIN || 'https://virgo.ph').replace(/\/+$/, '');

/** How long to wait for the API before showing the error page instead. */
const API_TIMEOUT = 8_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An address the throttle may bucket by: digits, hex, dots and colons only. */
const IP = /^[0-9a-f.:]{2,45}$/i;

/**
 * The post, or null when there is none to show.
 *
 * Null for every refusal — private, unposted, taken down, connections-only, a
 * suspended maker, an id that is not one — because the API answers them all
 * with the same 404 and the page must not be able to tell them apart either.
 * Anything else (the API down, a 429) throws, so the visitor sees "try again"
 * rather than a claim that the post does not exist.
 *
 * Never cached: a post made private must stop showing here at once, not at
 * the end of a revalidate window. `cache()` makes the page and its metadata
 * one request rather than two.
 *
 * The visitor's address goes along. This is read from the web server, so
 * without it every visitor would share the server's one allowance on the
 * API's per-address throttle; Cloudflare sets CF-Connecting-IP on the way in,
 * and the API trusts it only behind the proxy.
 */
export const readShowcase = cache(async (id: string): Promise<PublicShowcase | null> => {
  if (!UUID.test(id)) return null;
  const base = (process.env.API_INTERNAL_URL || API_BASE_URL).replace(/\/+$/, '');
  if (!base) throw new Error('No API address is configured for the share page.');

  const visitor = (await headers()).get('cf-connecting-ip')?.trim();
  const res = await fetch(`${base}/public/showcases/${id.toLowerCase()}`, {
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      ...(visitor && IP.test(visitor) ? { 'cf-connecting-ip': visitor } : {}),
    },
    signal: AbortSignal.timeout(API_TIMEOUT),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`The post could not be loaded (${res.status}).`);
  return (await res.json()) as PublicShowcase;
});

/** Where this post lives: lower case, on the apex, whatever host was asked. */
export function canonicalUrl(id: string): string {
  return `${SITE}/p/${id.toLowerCase()}`;
}

export function makerName(showcase: PublicShowcase): string {
  return showcase.maker.displayName.trim() || 'Someone';
}

/** The page's name: the post's title, or whose work it is. */
export function headline(showcase: PublicShowcase): string {
  return showcase.title?.trim() || `${makerName(showcase)}’s work`;
}

/** Whitespace folded, then cut at a word near `max` with an ellipsis. */
export function trimText(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  const word = space > max * 0.6 ? cut.slice(0, space) : cut;
  return `${word.replace(/[\s,.;:–—-]+$/, '')}…`;
}

/** What the preview says under the title: the caption, or what the post is. */
export function summary(showcase: PublicShowcase): string {
  if (showcase.caption?.trim()) return trimText(showcase.caption, 160);
  const films = showcase.pieces.filter((piece) => piece.kind === 'video').length;
  const what =
    films > 0
      ? 'A film'
      : showcase.pieces.length === 1
        ? 'A photograph'
        : `${showcase.pieces.length} photographs`;
  const where = showcase.location?.trim() ? `, ${showcase.location.trim()}` : '';
  return `${what} by ${makerName(showcase)}${where}, on Virgo.`;
}

export interface Still {
  url: string;
  width?: number;
  height?: number;
}

/** Closest to this many pixels wide: what Facebook and X draw a large card at. */
const CARD_WIDTH = 1200;

/**
 * The still a preview card shows for a piece.
 *
 * A photograph's web copy nearest 1200 wide, sized when the piece's shape is
 * known, else its thumbnail. A film's poster frame, unsized: its pixel size
 * is not the film's, and a wrong size is worse than none to a crawler that
 * lays the card out before fetching it.
 */
export function shareStill(piece: ShowcasePiece): Still {
  if (piece.kind === 'image' && piece.displaySources.length > 0) {
    const best = piece.displaySources.reduce((a, b) =>
      Math.abs(b.width - CARD_WIDTH) < Math.abs(a.width - CARD_WIDTH) ? b : a,
    );
    const height =
      piece.width && piece.height ? Math.round((best.width * piece.height) / piece.width) : undefined;
    return { url: best.url, width: best.width, ...(height ? { height } : {}) };
  }
  return { url: piece.url };
}

/** `2026-10-01T…` -> `1 October 2026`, on Philippine time. */
export function postedOn(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Manila',
  });
}
