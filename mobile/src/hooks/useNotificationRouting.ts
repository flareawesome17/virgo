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
      switch (payload.type) {
        case 'message':
          if (payload.conversationId) router.push(`/chat/${payload.conversationId}`);
          return;
        case 'reminder':
          if (payload.reminderId) router.push(`/schedule/reminders/${payload.reminderId}`);
          return;

        // An invitation lands on the schedule tab, where the invitation card
        // is. Not the event's own screen: it is not on your calendar until you
        // accept, so opening it would show a page you cannot act on.
        case 'event_invite':
          router.push('/(app)/(tabs)/schedule');
          return;
        // A response is about an event you own, so the event itself is right.
        // A move is about one you accepted, which you can also open — the
        // detail screen is readable by attendees, not just the organiser.
        case 'event_response':
        case 'event_updated':
          if (payload.eventId) router.push(`/schedule/${payload.eventId}`);
          else router.push('/(app)/(tabs)/schedule');
          return;

        // Friendships and workspace invitations are both answered from
        // Network, which is where these were doing nothing at all before.
        case 'friend_request':
        case 'friend_accepted':
        case 'collaborator_invite':
        case 'collaborator_response':
          router.push('/(app)/(tabs)/connect?view=people');
          return;

        // Both sides of a hire enquiry are answered from the same list, and an
        // accepted one is the only notification here that has a chat waiting
        // on the other end of it.
        case 'hire_enquiry':
          router.push('/friends/enquiries');
          return;
        case 'hire_response':
          if (payload.conversationId) router.push(`/chat/${payload.conversationId}`);
          else router.push('/friends/enquiries');
          return;

        // An application is answered from your own posts; an accepted one has
        // a chat waiting on the other end of it.
        case 'job_application':
          router.push('/jobs/mine');
          return;

        // Straight to what they chose, not to the album's front page.
        case 'client_picks':
          if (payload.albumId) router.push(`/albums/${payload.albumId}?picked=1`);
          return;
        case 'job_response':
          if (payload.conversationId) router.push(`/chat/${payload.conversationId}`);
          // Their applications, not their own postings — this is the
          // applicant's side of the workflow, and /jobs/mine opens on Posted.
          else router.push('/jobs/mine?tab=applications');
          return;

        // An announcement about the app itself opens the notification list,
        // where its full text is and where it is marked read — not its link
        // directly, which would take someone from a push straight out of the
        // app into a browser they did not ask for.
        case 'app-update':
          router.push('/notifications');
          return;
      }
    };

    return onNotificationTap(go);
  }, [enabled]);
}
