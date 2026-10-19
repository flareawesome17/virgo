import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Where each account's upload queue survives a process that ended without
 * being asked.
 *
 * One per account. There used to be a single queue for the phone, and it kept
 * running through a sign-out: the next person to sign in inherited the last
 * one's uploads, which failed against albums that were not theirs and then sat
 * in their upload bar under someone else's file names.
 *
 * Here rather than in UploadProvider so useAuth can clear one on account
 * deletion without importing the provider, which imports the hooks.
 */
export function uploadQueueKey(userId: string): string {
  return `virgo.upload.queue.v2:${userId}`;
}

/** The single queue from before, adopted by the first account to load. */
export const LEGACY_UPLOAD_QUEUE_KEY = 'virgo.upload.queue.v1';

/** For an account that no longer exists. Signing out keeps the queue. */
export async function forgetUploadQueue(userId: string): Promise<void> {
  await AsyncStorage.removeItem(uploadQueueKey(userId)).catch(() => {});
}
