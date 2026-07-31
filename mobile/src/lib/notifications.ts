import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Device notifications for reminders.
 *
 * Two independent delivery paths, on purpose:
 *
 *   Local  — scheduled on the device for `reminder_time`. Fires with no network
 *            and no server, and is what makes the alarm toggle mean something.
 *   Remote — the API pushes at the due time, so a reminder still arrives if the
 *            app was reinstalled or is being used from another device.
 *
 * Both carry `data.reminderId`, so a client that receives both for the same
 * reminder can tell they are the same event.
 *
 * Before this existed, `is_alarm_enabled` and `has_push_notification` were
 * booleans stored in Postgres that nothing ever read.
 */

/** Shows the notification even while the app is in the foreground. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Marks our own scheduled notifications so a sync never touches others'. */
const VIRGO_TAG = 'virgo.reminder';

export interface SchedulableReminder {
  id: string;
  title: string;
  description: string | null;
  /** ISO timestamp. */
  reminder_time: string;
  is_alarm_enabled: boolean;
  is_completed: boolean;
}

/**
 * Android delivers nothing without a channel, and importance is fixed at
 * creation time — an existing channel cannot be made louder later, which is why
 * the alarm and the quiet reminder are separate channels rather than one.
 */
export async function ensureChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('alarms', {
    name: 'Alarms',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#B66A40',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });

  await Notifications.setNotificationChannelAsync('reminders', {
    name: 'Reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: null,
    lightColor: '#B66A40',
  });
}

/**
 * Requests permission, returning whether it was granted.
 *
 * Never re-prompts once the user has answered: iOS only shows the system
 * dialog once, so asking again is a silent no.
 */
export async function ensurePermissions(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  if (!existing.canAskAgain) return false;

  const asked = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return asked.granted;
}

function isSchedulable(reminder: SchedulableReminder): boolean {
  if (reminder.is_completed) return false;
  const when = new Date(reminder.reminder_time).getTime();
  // A trigger in the past fires immediately, which would ambush the user with
  // every overdue reminder the moment the app opens.
  return Number.isFinite(when) && when > Date.now();
}

/**
 * Makes the device's scheduled notifications match the given reminders.
 *
 * Reconciles rather than tracking notification ids: create, edit, complete and
 * delete all reduce to "the list changed", and a stored id would go stale on
 * reinstall or on a second device. Only notifications this app scheduled are
 * cancelled.
 *
 * Returns how many are now scheduled.
 */
export async function syncReminderNotifications(
  reminders: SchedulableReminder[],
): Promise<number> {
  if (!(await ensurePermissions())) return 0;
  await ensureChannels();

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => (n.content.data as { tag?: string } | null)?.tag === VIRGO_TAG)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );

  const upcoming = reminders.filter(isSchedulable);

  await Promise.all(
    upcoming.map((reminder) =>
      Notifications.scheduleNotificationAsync({
        content: {
          title: reminder.title,
          body: reminder.description ?? 'Reminder',
          sound: reminder.is_alarm_enabled ? 'default' : undefined,
          data: { tag: VIRGO_TAG, reminderId: reminder.id, type: 'reminder' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(reminder.reminder_time),
          channelId: reminder.is_alarm_enabled ? 'alarms' : 'reminders',
        },
      }),
    ),
  );

  return upcoming.length;
}

/** Drops every reminder notification this app scheduled — used on sign-out. */
export async function clearReminderNotifications(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => (n.content.data as { tag?: string } | null)?.tag === VIRGO_TAG)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

export interface PushRegistration {
  token: string;
  platform: 'ios' | 'android' | 'web';
}

/**
 * Obtains an Expo push token for server-side delivery.
 *
 * Returns null rather than throwing whenever remote push is unavailable — on a
 * simulator, without permission, and in Expo Go, which cannot issue push tokens
 * (it has no bundle identifier of its own to register with APNs/FCM). Local
 * notifications are unaffected and still work in all of those cases.
 */
export async function getPushRegistration(): Promise<PushRegistration | null> {
  if (!Device.isDevice) return null;
  if (!(await ensurePermissions())) return null;

  // getExpoPushTokenAsync needs the EAS project id; without one it throws.
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  if (!projectId) return null;

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return {
      token: data,
      platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
    };
  } catch {
    // Expo Go lands here. Not an error worth surfacing: the local alarm still
    // fires, and remote push starts working once a dev build is installed.
    return null;
  }
}
