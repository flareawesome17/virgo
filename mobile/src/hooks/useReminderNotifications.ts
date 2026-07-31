import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { api } from '@/src/api/client';
import {
  getPushRegistration,
  syncReminderNotifications,
  type SchedulableReminder,
} from '@/src/lib/notifications';

/**
 * Keeps device notifications in step with the user's reminders.
 *
 * Runs whenever the reminder list changes and again when the app returns to the
 * foreground — a reminder created on another device only shows up after a
 * refetch, and its notification has to be scheduled locally too.
 *
 * Cheap to call repeatedly: the sync reconciles to the desired state rather
 * than appending, so a redundant run is a no-op.
 */
export function useReminderNotifications(reminders: SchedulableReminder[]) {
  // Only the fields that affect scheduling. Without this, a refetch returning
  // equal-but-new objects would reschedule every notification on every poll.
  const signature = reminders
    .map(
      (r) =>
        `${r.id}:${r.reminder_time}:${r.is_alarm_enabled}:${r.is_completed}:${r.title}`,
    )
    .sort()
    .join('|');

  const latest = useRef(reminders);
  latest.current = reminders;

  useEffect(() => {
    void syncReminderNotifications(latest.current);
  }, [signature]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncReminderNotifications(latest.current);
    });
    return () => sub.remove();
  }, []);
}

/**
 * Registers this device for server-sent push, once per session.
 *
 * Silently does nothing where remote push is unavailable (Expo Go, simulators,
 * permission denied) — the local alarm covers those cases.
 */
export function usePushRegistration(enabled: boolean) {
  const registered = useRef(false);

  useEffect(() => {
    if (!enabled || registered.current) return;
    registered.current = true;

    void (async () => {
      const registration = await getPushRegistration();
      if (!registration) return;
      try {
        await api.post('/notifications/token', { body: registration });
      } catch {
        // A failed registration must not break the app; the local alarm and
        // the next launch's retry both still work.
        registered.current = false;
      }
    })();
  }, [enabled]);
}
