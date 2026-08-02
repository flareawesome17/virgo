import { useEffect } from 'react';
import { router } from 'expo-router';
import { onNotificationTap, type NotificationPayload } from '@/src/lib/notifications';

/**
 * Opens whatever a tapped notification is about.
 *
 * Without this a notification is only an announcement: tapping it brought the
 * app to whichever screen it was last on, which for a chat message is almost
 * never the thread the message came from.
 *
 * Mounted inside the authenticated layout, so a tap can never route a
 * signed-out user at a protected screen.
 */
export function useNotificationRouting(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const go = (payload: NotificationPayload) => {
      if (payload.type === 'message' && payload.conversationId) {
        router.push(`/chat/${payload.conversationId}`);
        return;
      }
      if (payload.type === 'reminder' && payload.reminderId) {
        router.push(`/schedule/reminders/${payload.reminderId}`);
      }
    };

    return onNotificationTap(go);
  }, [enabled]);
}
