import { Alert, Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { payMethodName, type MoneyPayMethod } from '@/src/api';
import { canSaveToPhotos } from '@/src/lib/photo-permission';

/**
 * Copy, save and send for one way to pay: what Show QR offers under the code.
 *
 * Nothing here goes through Virgo. The details are on the phone already; the
 * QR is the picture you uploaded, fetched from its short-lived link and handed
 * to the photo library or the share sheet.
 */

/** "GCash · Mika Dela Cruz · 0917 123 4567": the line that travels with a QR. */
export function payDetailsLine(m: MoneyPayMethod): string {
  return [payMethodName(m), m.accountName, m.accountNumber].filter(Boolean).join(' · ');
}

/** Saving and sending a picture need the phone's own file and share sheets. */
export const CAN_HANDLE_FILES = Platform.OS !== 'web';

export async function copyPayNumber(m: MoneyPayMethod): Promise<boolean> {
  const value = m.accountNumber ?? payDetailsLine(m);
  await Clipboard.setStringAsync(value);
  return true;
}

/** The QR, downloaded into the cache under a plain name; the caller deletes it. */
async function downloadQr(m: MoneyPayMethod): Promise<string> {
  const url = m.qr?.url;
  if (!url) throw new Error('This way to pay has no QR code.');
  const ext = m.qr?.contentType === 'image/png' ? 'png' : m.qr?.contentType === 'image/webp' ? 'webp' : 'jpg';
  const name = `${payMethodName(m).replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'pay'}-qr.${ext}`;
  const result = await FileSystem.downloadAsync(url, `${FileSystem.cacheDirectory}${Date.now()}-${name}`);
  if (result.status < 200 || result.status >= 300) {
    await FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => {});
    throw new Error('The QR code could not be downloaded.');
  }
  return result.uri;
}

/** Saves the QR to the photo library, so it can be sent or uploaded from there. True when saved. */
export async function savePayQr(m: MoneyPayMethod): Promise<boolean> {
  if (!CAN_HANDLE_FILES || !m.qr?.url) return false;
  if (!(await canSaveToPhotos('this QR code'))) return false;
  let local: string | null = null;
  try {
    local = await downloadQr(m);
    await MediaLibrary.saveToLibraryAsync(local);
    return true;
  } catch {
    Alert.alert("Couldn't save it", 'Check your connection and try again.');
    return false;
  } finally {
    if (local) await FileSystem.deleteAsync(local, { idempotent: true }).catch(() => {});
  }
}

/**
 * Sends the details, and the QR where the phone can: Messenger, Viber, a
 * text. iOS shares the picture with the line under it. Android's share sheet
 * takes text only from here, so it sends the details and says to save the QR.
 */
export async function sendPayMethod(m: MoneyPayMethod): Promise<void> {
  const line = payDetailsLine(m);
  const hasQr = !!m.qr?.url;
  const message = hasQr
    ? `${line}\nScan this QR, or save it and upload it in your app to pay.`
    : `${line}\nSend your payment to this number, then a screenshot so I can mark it received.`;

  if (Platform.OS === 'ios' && hasQr) {
    let local: string | null = null;
    try {
      local = await downloadQr(m);
      await Share.share({ url: local, message });
    } catch (err) {
      // Cancelling the sheet rejects on some versions; that is not a failure.
      if (err instanceof Error && !/cancel/i.test(err.message)) {
        await Share.share({ message }).catch(() => undefined);
      }
    } finally {
      if (local) await FileSystem.deleteAsync(local, { idempotent: true }).catch(() => {});
    }
    return;
  }
  await Share.share({ message }).catch(() => undefined);
}
