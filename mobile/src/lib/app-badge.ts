import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { chatApi, queryKeys } from '@/src/api';
import { chatKeys } from '@/src/hooks/useChat';
import { useUnreadNotifications } from '@/src/hooks/useNotifications';
import { appBadgeTotal } from '@/src/lib/badge-total';
import { ensureBadgePermission, setAppBadgeCount } from '@/src/lib/notifications';

/**
 * Keeps the number on the app's home-screen icon (iOS) equal to what the app
 * shows inside: unread messages plus unread notifications.
 *
 * A push sets the icon from the server while the app is shut. This takes over
 * whenever it is open — reading a thread or the bell takes the number down at
 * once — and sets it again on the way out, so the icon is right whichever of
 * the two last touched it.
 *
 * The two counts are the same queries the Messages dot and the bell read, so
 * the realtime socket, which invalidates them on every message and
 * notification frame, moves the icon too. Nothing here is native beyond
 * expo-notifications, which every build already has, so it ships over the air.
 *
 * Mounted once, with the other notification services, only while signed in.
 * Signing out clears the icon in forgetSession (useAuth).
 */
export function useAppIconBadge(enabled: boolean): void {
  const queryClient = useQueryClient();
  // Shared with useUnreadCount (useChat) by key, with the same options; read
  // here as a query rather than through that hook to know when it has loaded.
  const messages = useQuery({
    queryKey: chatKeys.unread,
    queryFn: () => chatApi.unread(),
    refetchInterval: 60_000,
    enabled,
  });
  const notifications = useUnreadNotifications();
  const total = enabled ? appBadgeTotal(messages.data?.count, notifications.data?.count) : null;

  const latest = useRef<number | null>(null);
  latest.current = total;

  // Installs from before the badge was asked for allowed notifications
  // without it, and iOS drops every badge until it is allowed.
  useEffect(() => {
    if (enabled) void ensureBadgePermission();
  }, [enabled]);

  useEffect(() => {
    if (total !== null) void setAppBadgeCount(total);
  }, [total]);

  useEffect(() => {
    if (!enabled) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        // Both counts, now: a push may have changed the icon while the app was
        // away, and the chat count is otherwise fresh for thirty seconds, so
        // coming back within that window drew the old number. Set again once
        // they are back even if unchanged — the push's number may differ.
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: chatKeys.unread }),
          queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unread }),
        ]).then(() => {
          if (latest.current !== null) void setAppBadgeCount(latest.current);
        });
      } else if (state === 'background' && latest.current !== null) {
        void setAppBadgeCount(latest.current);
      }
    });
    return () => subscription.remove();
  }, [enabled, queryClient]);
}
