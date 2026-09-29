import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { api } from '@/src/api/client';
import {
  getPushRegistration,
  isPushTurnedOff,
  syncReminderNotifications,
  type SchedulableReminder,
} from '@/src/lib/notifications';

/**
 * Tells the server this phone now holds its reminders as local alarms, so the
 * reminder sweep leaves it out of the push for them — once, not twice. Best
 * effort: missing it only means the old behaviour, a push as well.
 */
async function reportSynced(coveredUntil: string | null): Promise<void> {
  const registration = await getPushRegistration();
  if (!registration) return;
  try {
    await api.post('/notifications/token/reminders-synced', {
      body: { token: registration.token, coveredUntil: coveredUntil ?? undefined },
    });
  } catch {
    // Offline, or an API from before the endpoint: the push still arrives.
  }
}

/**
 * Keeps device notifications in step with the user's reminders.
 *
 * Runs whenever the reminder list changes and again when the app returns to the
 * foreground — a reminder created on another device only shows up after a
 * refetch, and its notification has to be scheduled locally too.
 *
 * Cheap to call repeatedly: the sync reconciles to the desired state rather
 * than appending, so a redundant run is a no-op.
 *
 * Only once the list has actually loaded. A sync runs against what it is
 * given, so one run against the empty list of a load in progress, a failure or
 * an offline start cancelled every alarm on the phone — and now it would also
 * tell the server the phone was covered while it held nothing. Runs are
 * queued one after another, so two can never interleave their cancel and
 * schedule steps.
 */
export function useReminderNotifications(
  reminders: SchedulableReminder[],
  { ready, listThrough = null }: { ready: boolean; listThrough?: string | null },
) {
  // Only the fields that affect scheduling. Without this, a refetch returning
  // equal-but-new objects would reschedule every notification on every poll.
  const signature = reminders
    .map(
      (r) =>
        `${r.id}:${r.reminder_time}:${r.is_alarm_enabled}:${r.has_push_notification}:${r.is_completed}:${r.title}`,
    )
    .sort()
    .join('|');

  const latest = useRef({ reminders, listThrough, ready });
  latest.current = { reminders, listThrough, ready };
  const queue = useRef<Promise<void>>(Promise.resolve());

  const sync = () => {
    queue.current = queue.current.then(async () => {
      const { reminders: now, listThrough: through, ready: loaded } = latest.current;
      if (!loaded) return;
      const result = await syncReminderNotifications(now, through);
      if (result) await reportSynced(result.coveredUntil);
    });
  };

  useEffect(() => {
    if (ready) sync();
  }, [signature, listThrough, ready]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    return () => sub.remove();
  }, []);
}

/**
 * Registers this device for server-sent push, once per signed-in account.
 *
 * Silently does nothing where remote push is unavailable (Expo Go, simulators,
 * permission denied) — the local alarm covers those cases — and when this
 * account turned push off on this device in Privacy.
 */
export function usePushRegistration(userId: string | null) {
  const registeredFor = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || registeredFor.current === userId) return;
    registeredFor.current = userId;

    void (async () => {
      // Checked before getPushRegistration, which asks for permission: an
      // account that switched push off should not be prompted for it either.
      if (await isPushTurnedOff(userId)) return;
      const registration = await getPushRegistration();
      if (!registration) return;
      try {
        await api.post('/notifications/token', { body: registration });
      } catch {
        // A failed registration must not break the app; the local alarm and
        // the next launch's retry both still work.
        registeredFor.current = null;
      }
    })();
  }, [userId]);
}
