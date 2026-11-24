import { Alert, Linking, Platform } from 'react-native';
import { router } from 'expo-router';
import {
  isFilesMessage,
  pinLine,
  voiceAttachment,
  voiceLength,
  type ConversationMessage,
} from '@/src/api';

/** What running out of storage means for chat: only what comes from your phone stops. */
export const STORAGE_FULL_WORDS =
  "You're out of storage. Photos, files and voice notes from your phone won't send, but messages, album photos, cards and dates always will.";

/**
 * Says so, with a way to the storage screen. `extra` buttons go between
 * "Not now" and "Storage": a retry, a discard.
 */
export function alertStorageFull(extra: { text: string; onPress: () => void; destructive?: boolean }[] = []): void {
  // The Expo web preview has no Alert at all (react-native-web's does nothing).
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`You're out of storage\n\n${STORAGE_FULL_WORDS}\n\nOpen Storage?`)) {
      router.push('/settings/storage');
    }
    return;
  }
  Alert.alert("You're out of storage", STORAGE_FULL_WORDS, [
    // Android shows three buttons at most; with two of the caller's, a tap
    // outside is the way to leave it.
    ...(extra.length < 2 ? [{ text: 'Not now', style: 'cancel' as const }] : []),
    ...extra.map((b) => ({
      text: b.text,
      onPress: b.onPress,
      style: b.destructive ? ('destructive' as const) : ('default' as const),
    })),
    { text: 'Storage', onPress: () => router.push('/settings/storage') },
  ]);
}

/** A short notice with only an OK: an Alert, or on the web preview the browser's own. */
export function tell(title: string, words: string): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${words}`);
    return;
  }
  Alert.alert(title, words);
}

/**
 * The microphone or the camera is switched off for Virgo: says so, with the
 * way to the phone's Settings, where it is switched back on.
 */
export function alertTurnedOff(what: 'microphone' | 'camera'): void {
  const title = what === 'microphone' ? 'The microphone is off for Virgo' : 'The camera is off for Virgo';
  const words =
    what === 'microphone'
      ? 'To record a voice note, switch on the microphone for Virgo in Settings.'
      : 'To take a photo here, switch on the camera for Virgo in Settings.';
  if (Platform.OS === 'web') {
    tell(title, words);
    return;
  }
  Alert.alert(title, words, [
    { text: 'Not now', style: 'cancel' },
    { text: 'Open Settings', onPress: () => void Linking.openSettings().catch(() => undefined) },
  ]);
}

/** "Voice note (0:32)": a voice note quoted, or forwarded. */
export function voiceQuote(durationMs: number | null | undefined): string {
  return durationMs ? `Voice note (${voiceLength(durationMs)})` : 'Voice note';
}

/**
 * One line for a message somebody is answering: its words, or for photos, a
 * file or a voice note what they are ("4 photos: Reference for…", "File:
 * Call sheet.pdf", "Voice note (0:32)").
 */
export function quoteLine(m: ConversationMessage): string {
  if (m.kind === 'voice') return voiceQuote(voiceAttachment(m)?.durationMs);
  return isFilesMessage(m) ? pinLine(m) : m.body;
}

/**
 * The same line from a reply's stored quote, when the message it answers
 * isn't loaded: the server quotes its plain body, "Sent 4 photos\n<caption>",
 * "Sent a file: Call sheet.pdf\n<caption>" or "Sent a voice note (0:32)".
 */
export function quoteFromBody(body: string): string {
  const [first, ...rest] = body.split('\n');
  const caption = rest.join(' ').trim();
  const file = /^Sent a file: (.+)$/.exec(first);
  if (file) return `File: ${file[1]}`;
  const voice = /^Sent a voice note(?: \((\d+:\d{2})\))?$/.exec(first);
  if (voice) return voice[1] ? `Voice note (${voice[1]})` : 'Voice note';
  const photos = /^Sent (a photo|\d+ photos)$/.exec(first);
  if (photos) {
    const label = photos[1] === 'a photo' ? 'Photo' : photos[1];
    return caption ? `${label}: ${caption}` : label;
  }
  return first;
}
