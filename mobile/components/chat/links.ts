import { Linking } from 'react-native';
import { router, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

/**
 * Where a Virgo page opens inside the app, or null for one that has no
 * screen here (a client link, a package statement) and opens in a browser.
 *
 * Only virgo.ph itself: media.virgo.ph and the like are files, not pages.
 */
export function inAppRoute(href: string): Href | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host !== 'virgo.ph' && host !== 'www.virgo.ph') return null;
  let parts: string[];
  try {
    parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return null;
  }

  // A profile: virgo.ph/u/<handle>, or the address people share, /@<handle>.
  if (parts[0] === 'u' && parts[1] && parts.length === 2) {
    return `/u/${encodeURIComponent(parts[1])}`;
  }
  if (parts.length === 1 && parts[0].startsWith('@') && parts[0].length > 1) {
    return `/u/${encodeURIComponent(parts[0].slice(1))}`;
  }
  // A job post.
  if (parts[0] === 'jobs' && parts[1] && parts.length === 2) {
    return `/jobs/${encodeURIComponent(parts[1])}`;
  }
  // A post, which the app calls a showcase.
  if (parts[0] === 'p' && parts[1] && parts.length === 2) {
    return `/showcase/${encodeURIComponent(parts[1])}`;
  }
  return null;
}

/**
 * Opens a link from a message: a Virgo page on its own screen, anything else
 * in the in-app browser, and the system's handler if that cannot open it.
 */
export function openChatLink(href: string): void {
  const route = inAppRoute(href);
  if (route) {
    router.push(route);
    return;
  }
  if (!/^https?:\/\//i.test(href)) return;
  WebBrowser.openBrowserAsync(href).catch(() => {
    Linking.openURL(href).catch(() => undefined);
  });
}
