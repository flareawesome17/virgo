import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

/**
 * Device notifications for reminders.
 *
 * Two independent delivery paths, on purpose:
 *
 *   Local  — scheduled on the device for `reminder_time`. Fires with no network
 *            and no server, and is what makes the alarm toggle mean something.
 *            Still works in Expo Go.
 *   Remote — the API pushes at the due time, so a reminder still arrives if the
 *            app was reinstalled or is being used from another device. Requires
 *            a development build; Expo Go dropped remote push in SDK 53.
 *
 * Both carry `data.reminderId`, so a client receiving both for one reminder can
 * tell they are the same event.
 *
 * `expo-notifications` is loaded lazily rather than imported at the top of this
 * file. Importing it runs DevicePushTokenAutoRegistration, which registers a
 * push-token listener and — in Expo Go — logs a console.error about remote push
 * being unavailable. This module is reached from useAuth, so that fired on
 * every app start, before anything had asked for a notification.
 */

type NotificationsModule = typeof import('expo-notifications');

/**
 * The local-notification surface, imported without the package barrel.
 *
 * `expo-notifications/build/index` pulls in DevicePushTokenAutoRegistration,
 * which registers a push-token listener on load and, in Expo Go, logs a
 * console.error saying remote push was removed in SDK 53. None of the
 * submodules below reach that code, so scheduling still works in Expo Go and
 * says nothing — the warning is about remote push, which is genuinely
 * unavailable there and is loaded separately in `getPushRegistration`.
 */
type LocalApi = {
  setNotificationHandler: NotificationsModule['setNotificationHandler'];
  getPermissionsAsync: NotificationsModule['getPermissionsAsync'];
  requestPermissionsAsync: NotificationsModule['requestPermissionsAsync'];
  setNotificationChannelAsync: NotificationsModule['setNotificationChannelAsync'];
  scheduleNotificationAsync: NotificationsModule['scheduleNotificationAsync'];
  getAllScheduledNotificationsAsync: NotificationsModule['getAllScheduledNotificationsAsync'];
  cancelScheduledNotificationAsync: NotificationsModule['cancelScheduledNotificationAsync'];
  // Cancelling only removes something not yet shown. Taking a notification
  // that is already in the drawer back out needs this one, which is what an
  // upload finishing has to do to its own progress line.
  dismissNotificationAsync: NotificationsModule['dismissNotificationAsync'];
  addNotificationResponseReceivedListener: NotificationsModule['addNotificationResponseReceivedListener'];
  getLastNotificationResponseAsync: NotificationsModule['getLastNotificationResponseAsync'];
  AndroidImportance: NotificationsModule['AndroidImportance'];
  AndroidNotificationVisibility: NotificationsModule['AndroidNotificationVisibility'];
  SchedulableTriggerInputTypes: NotificationsModule['SchedulableTriggerInputTypes'];
};

let cached: LocalApi | null = null;
let handlerSet = false;

/* eslint-disable @typescript-eslint/no-require-imports */
function loadNotifications(): LocalApi | null {
  if (cached) return cached;
  try {
    const perms = require('expo-notifications/build/NotificationPermissions');
    const channels = require('expo-notifications/build/setNotificationChannelAsync');
    const schedule = require('expo-notifications/build/scheduleNotificationAsync');
    const getAll = require('expo-notifications/build/getAllScheduledNotificationsAsync');
    const cancel = require('expo-notifications/build/cancelScheduledNotificationAsync');
    const dismiss = require('expo-notifications/build/dismissNotificationAsync');
    const handler = require('expo-notifications/build/NotificationsHandler');
    const types = require('expo-notifications/build/Notifications.types');
    const channelTypes = require('expo-notifications/build/NotificationChannelManager.types');
    // Taps only. This module imports the emitter and nothing token-related, so
    // it stays clear of DevicePushTokenAutoRegistration like the rest.
    const emitter = require('expo-notifications/build/NotificationsEmitter');

    cached = {
      setNotificationHandler: handler.setNotificationHandler,
      getPermissionsAsync: perms.getPermissionsAsync,
      requestPermissionsAsync: perms.requestPermissionsAsync,
      setNotificationChannelAsync: channels.default,
      scheduleNotificationAsync: schedule.default,
      getAllScheduledNotificationsAsync: getAll.default,
      cancelScheduledNotificationAsync: cancel.default,
      dismissNotificationAsync: dismiss.default,
      addNotificationResponseReceivedListener:
        emitter.addNotificationResponseReceivedListener,
      getLastNotificationResponseAsync: emitter.getLastNotificationResponseAsync,
      AndroidImportance: channelTypes.AndroidImportance,
      AndroidNotificationVisibility: channelTypes.AndroidNotificationVisibility,
      SchedulableTriggerInputTypes: types.SchedulableTriggerInputTypes,
    };
  } catch {
    // Deep imports are internal paths and could move between SDK versions, so
    // fall back to the barrel rather than losing notifications entirely. The
    // Expo Go warning is the cost, and only in that case.
    try {
      cached = require('expo-notifications') as unknown as LocalApi;
    } catch {
      return null;
    }
  }

  if (cached && !handlerSet) {
    handlerSet = true;
    // Shows the notification even while the app is in the foreground.
    cached.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }

  return cached;
}
/* eslint-enable @typescript-eslint/no-require-imports */

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
  const N = loadNotifications();
  if (!N) return;

  await N.setNotificationChannelAsync('alarms', {
    name: 'Alarms',
    importance: N.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#B66A40',
    lockscreenVisibility: N.AndroidNotificationVisibility.PUBLIC,
  });

  await N.setNotificationChannelAsync('reminders', {
    name: 'Reminders',
    importance: N.AndroidImportance.DEFAULT,
    sound: null,
    lightColor: '#B66A40',
  });

  // Separate from 'reminders', which is deliberately silent and still. A chat
  // message should buzz, and importance cannot be raised on a channel that
  // already exists.
  await N.setNotificationChannelAsync('messages', {
    name: 'Messages',
    importance: N.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 120, 90, 120],
    lightColor: '#B66A40',
    // PRIVATE, not PUBLIC: the body is someone's message, and it should not be
    // readable over a shoulder on a locked screen.
    lockscreenVisibility: N.AndroidNotificationVisibility.PRIVATE,
  });

  // Invitations — to an event, a workspace, or a friendship — were going out
  // on 'reminders', which is silent by design. They arrived with no sound and
  // no buzz, so an invitation waiting on an answer looked like no notification
  // at all. They need to interrupt: somebody is waiting on a reply.
  await N.setNotificationChannelAsync('invitations', {
    name: 'Invitations',
    importance: N.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 150, 100, 150],
    lightColor: '#B66A40',
    lockscreenVisibility: N.AndroidNotificationVisibility.PRIVATE,
  });

  // Deliberately the quietest channel in the app. This one rewrites itself
  // every few percent while an upload runs, and a sound or a buzz on each of
  // those would be unbearable. LOW keeps it in the drawer without it ever
  // appearing as a banner over what someone is doing.
  await N.setNotificationChannelAsync('uploads', {
    name: 'Uploads',
    importance: N.AndroidImportance.LOW,
    sound: null,
    vibrationPattern: null,
    lightColor: '#B66A40',
  });

  // News about the app itself. Its own channel so it can be muted without
  // muting anything a person is waiting on, and quiet like 'reminders': an
  // update is worth knowing about, not worth a buzz. Created with every
  // registration (see getPushRegistration), because the server only pushes
  // announcements to devices that registered — so no announcement can arrive
  // on a phone that has not made this channel, which Android would not show.
  await N.setNotificationChannelAsync('updates', {
    name: 'App updates',
    importance: N.AndroidImportance.DEFAULT,
    sound: null,
    vibrationPattern: null,
    lightColor: '#B66A40',
  });
}

/** The one notification the upload queue owns, replaced rather than stacked. */
const UPLOAD_NOTIFICATION_ID = 'virgo-upload-progress';

/**
 * Writes the upload queue's line in the notification drawer.
 *
 * Re-scheduling under the same identifier replaces the previous one, so this
 * reads as a single line that keeps changing rather than one notification per
 * percent. The caller decides how often to call it; the channel above is what
 * makes a rewrite silent.
 *
 * Failure is swallowed. An upload should not stop because the drawer could not
 * be written to — the in-app progress is the real surface, and this is the copy
 * of it for when the app is not on screen.
 */
export async function showUploadProgress(
  title: string,
  body: string,
): Promise<void> {
  const N = loadNotifications();
  if (!N) return;

  // Neither of these was done, and both are required for anything to appear.
  // Without permission nothing posts at all; without the channel Android
  // accepts the call and drops the notification, silently — which is exactly
  // what "no indicator, even in the drawer" looked like.
  //
  // ensurePermissions never re-prompts once answered, so this is a cheap
  // check on every call rather than a dialog.
  if (!(await ensurePermissions())) return;
  await ensureChannels();

  try {
    await N.scheduleNotificationAsync({
      identifier: UPLOAD_NOTIFICATION_ID,
      content: {
        title,
        body,
        sound: null,
        // Android only. Keeps it out of the way of a swipe-to-dismiss while
        // the transfer is still going, the way a file manager's does.
        sticky: true,
        ...(Platform.OS === 'android' ? { channelId: 'uploads' } : {}),
      },
      trigger: null,
    });
  } catch {
    // See above.
  }
}

/** Takes the upload line back out of the drawer. */
export async function clearUploadProgress(): Promise<void> {
  const N = loadNotifications();
  if (!N) return;
  try {
    // Both: one for a notification already shown, one for a scheduled write
    // that has not landed yet. Either alone leaves the line behind in a race.
    await N.dismissNotificationAsync(UPLOAD_NOTIFICATION_ID);
    await N.cancelScheduledNotificationAsync(UPLOAD_NOTIFICATION_ID);
  } catch {
    // See above.
  }
}

/**
 * Says how a finished batch went, once, after the progress line is gone.
 *
 * Its own identifier rather than the progress one: this should survive in the
 * drawer after the upload line is dismissed, which is the whole point of it.
 */
export async function showUploadFinished(
  title: string,
  body: string,
): Promise<void> {
  const N = loadNotifications();
  if (!N) return;

  // Neither of these was done, and both are required for anything to appear.
  // Without permission nothing posts at all; without the channel Android
  // accepts the call and drops the notification, silently — which is exactly
  // what "no indicator, even in the drawer" looked like.
  //
  // ensurePermissions never re-prompts once answered, so this is a cheap
  // check on every call rather than a dialog.
  if (!(await ensurePermissions())) return;
  await ensureChannels();

  try {
    await N.scheduleNotificationAsync({
      content: {
        title,
        body,
        ...(Platform.OS === 'android' ? { channelId: 'uploads' } : {}),
      },
      trigger: null,
    });
  } catch {
    // See above.
  }
}

/**
 * Requests permission, returning whether it was granted.
 *
 * Never re-prompts once the user has answered: iOS only shows the system
 * dialog once, so asking again is a silent no.
 */
export async function ensurePermissions(): Promise<boolean> {
  const N = loadNotifications();
  if (!N) return false;

  const existing = await N.getPermissionsAsync();
  if (existing.granted) return true;
  if (!existing.canAskAgain) return false;

  const asked = await N.requestPermissionsAsync({
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
  const N = loadNotifications();
  if (!N) return 0;
  if (!(await ensurePermissions())) return 0;
  await ensureChannels();

  const scheduled = await N.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => (n.content.data as { tag?: string } | null)?.tag === VIRGO_TAG)
      .map((n) => N.cancelScheduledNotificationAsync(n.identifier)),
  );

  const upcoming = reminders.filter(isSchedulable);

  await Promise.all(
    upcoming.map((reminder) =>
      N.scheduleNotificationAsync({
        content: {
          title: reminder.title,
          body: reminder.description ?? 'Reminder',
          sound: reminder.is_alarm_enabled ? 'default' : undefined,
          data: { tag: VIRGO_TAG, reminderId: reminder.id, type: 'reminder' },
        },
        trigger: {
          type: N.SchedulableTriggerInputTypes.DATE,
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
  const N = loadNotifications();
  if (!N) return;

  const scheduled = await N.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => (n.content.data as { tag?: string } | null)?.tag === VIRGO_TAG)
      .map((n) => N.cancelScheduledNotificationAsync(n.identifier)),
  );
}

export interface PushRegistration {
  token: string;
  platform: 'ios' | 'android' | 'web';
  /**
   * This binary's version, so an update announcement is pushed only to the
   * phones it applies to — an OTA reaches exactly one version.
   */
  appVersion?: string;
}

/**
 * Obtains an Expo push token for server-side delivery.
 *
 * Returns null rather than throwing whenever remote push is unavailable — on a
 * simulator, without an EAS project id, and in Expo Go, which dropped remote
 * push in SDK 53. The Expo Go check comes first and short-circuits before the
 * native module is even loaded, so the unavailable path costs nothing and logs
 * nothing. Local notifications are unaffected in all of those cases.
 */
export async function getPushRegistration(): Promise<PushRegistration | null> {
  if (isRunningInExpoGo()) return null;
  if (!Device.isDevice) return null;

  // getExpoPushTokenAsync needs the EAS project id; without one it throws.
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  if (!projectId) return null;

  if (!(await ensurePermissions())) return null;

  try {
    // The barrel, not the local-only surface: this is the one call that needs
    // the push machinery. Reached only outside Expo Go, where loading it is
    // silent and remote push actually works.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const N = require('expo-notifications') as NotificationsModule;
    const { data } = await N.getExpoPushTokenAsync({ projectId });
    // Before the token is handed over, not after: the server pushes update
    // announcements on the 'updates' channel, and only to devices that
    // registered with a version. Creating the channels here is what makes
    // "reported a version" imply "has the channel".
    //
    // If that fails, the device still registers — just without a version, so
    // messages and reminders keep arriving and only the announcements it could
    // not display are withheld. Failing the whole registration instead would
    // have cost every other push for the sake of one channel.
    const channelsReady = await ensureChannels().then(
      () => true,
      () => false,
    );
    const appVersion = channelsReady ? Constants.expoConfig?.version : undefined;
    return {
      token: data,
      platform:
        Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
      ...(appVersion ? { appVersion } : {}),
    };
  } catch {
    return null;
  }
}

/** True when remote push cannot work here, so the UI can say why. */
export function isRemotePushAvailable(): boolean {
  return !isRunningInExpoGo() && Device.isDevice;
}

/** What a notification's `data` carries, for routing a tap. */
export interface NotificationPayload {
  type?:
    | 'message'
    | 'reminder'
    | 'friend_request'
    | 'friend_accepted'
    | 'collaborator_invite'
    | 'collaborator_response'
    | 'event_invite'
    | 'event_response'
    | 'event_updated'
    | 'hire_enquiry'
    | 'hire_response'
    | 'job_application'
    | 'job_response'
    | 'client_picks'
    /** An update announcement for this app. */
    | 'app-update'
    | string;
  conversationId?: string;
  albumId?: string;
  reminderId?: string;
  eventId?: string;
  workspaceId?: string;
  fromUserId?: string;
  /** For 'app-update': the announcement, and what to open from it. */
  updateId?: string;
  url?: string;
}

function payloadOf(response: unknown): NotificationPayload | null {
  const data = (
    response as {
      notification?: { request?: { content?: { data?: NotificationPayload } } };
    }
  )?.notification?.request?.content?.data;
  return data ?? null;
}

/**
 * Calls back when a notification is tapped, including the one that launched
 * the app from cold.
 *
 * The cold-start case is separate because the listener is registered after the
 * tap already happened — without `getLastNotificationResponseAsync` the app
 * would open on the home screen having ignored what the user actually tapped.
 *
 * Returns an unsubscribe function.
 */
export function onNotificationTap(
  handle: (payload: NotificationPayload) => void,
): () => void {
  const N = loadNotifications();
  if (!N) return () => {};

  let cancelled = false;

  void N.getLastNotificationResponseAsync()
    .then((last) => {
      if (cancelled || !last) return;
      const payload = payloadOf(last);
      if (payload) handle(payload);
    })
    .catch(() => {
      // A missing launch response is normal; nothing to recover from.
    });

  const sub = N.addNotificationResponseReceivedListener((response) => {
    const payload = payloadOf(response);
    if (payload) handle(payload);
  });

  return () => {
    cancelled = true;
    sub.remove();
  };
}

/**
 * A short buzz for a message that arrived while the app is open.
 *
 * The notification channel covers the background case, but a foreground
 * message never reaches it — polling puts the message on screen with no
 * system notification at all, so the feedback has to be triggered here.
 *
 * Haptics is loaded lazily and failures are swallowed: a device without a
 * vibrator, or web, should cost nothing and break nothing.
 */
export async function buzzForMessage(): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Haptics = require('expo-haptics') as typeof import('expo-haptics');
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // No vibrator, no permission, or web — silence is an acceptable fallback.
  }
}
