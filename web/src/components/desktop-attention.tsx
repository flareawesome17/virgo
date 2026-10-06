'use client';

import { useEffect, useRef } from 'react';
import { useUnreadCount } from '@/hooks/useChat';
import { useUnreadNotifications } from '@/hooks/useNotifications';
import {
  ATTENTION_INFORMATIONAL,
  IS_DESKTOP,
  IS_WINDOWS,
  desktopWindow,
} from '@/lib/desktop';

/**
 * What the desktop app shows outside its own window: the title in the taskbar
 * and the window switcher, the badge on the dock, and a flash when something
 * new arrives while you are elsewhere.
 *
 * A browser tab gets most of this for free from the page title and the
 * favicon. The app's window had none of it — its title was "Virgo" whatever
 * was waiting — so a message that arrived while somebody was editing in
 * another program sat there until they happened to switch back.
 *
 * Renders nothing. On the web it does nothing at all, down to not subscribing
 * to the counts: the build-time flag decides whether the part that does is
 * mounted.
 */
export function DesktopAttention() {
  return IS_DESKTOP ? <UnreadSignals /> : null;
}

const TITLE = 'Virgo';

function UnreadSignals() {
  // The same two counts the Messages badge and the bell show, so the window
  // never disagrees with what is inside it. Messages are not notifications,
  // so adding them counts nothing twice.
  const messages = useUnreadCount();
  const { count: notifications } = useUnreadNotifications();
  const total = messages + notifications;

  // The count as of the last change, to tell a rise from a fall. It starts at
  // the first count drawn, which on the desktop is usually the one kept on
  // disk from last time: what was already waiting is not news, and only what
  // arrived since flashes.
  const seen = useRef(total);

  useEffect(() => {
    const win = desktopWindow();
    if (!win) return;
    void win.setTitle(total > 0 ? `${TITLE} (${total})` : TITLE).catch(() => undefined);
    // The dock's badge. Windows has no equivalent the shell can set, and the
    // call is refused there, so it is not made.
    if (!IS_WINDOWS) void win.setBadgeCount(total > 0 ? total : undefined).catch(() => undefined);

    const before = seen.current;
    seen.current = total;
    if (total <= before) return;
    // Only while you are elsewhere: somebody looking at the window has already
    // seen the badge change, and a flash on top of that is noise.
    void win
      .isFocused()
      .then((focused) => (focused ? undefined : win.requestUserAttention(ATTENTION_INFORMATIONAL)))
      .catch(() => undefined);
  }, [total]);

  // Signing out unmounts the shell, and the next person to sit down should not
  // see the last one's count on the dock.
  useEffect(
    () => () => {
      const win = desktopWindow();
      if (!win) return;
      void win.setTitle(TITLE).catch(() => undefined);
      if (!IS_WINDOWS) void win.setBadgeCount(undefined).catch(() => undefined);
    },
    [],
  );

  return null;
}
