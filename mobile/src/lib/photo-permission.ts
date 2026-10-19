import * as MediaLibrary from 'expo-media-library';
import { Alert, Linking } from 'react-native';

/**
 * Permission to add to the photo library, and only to add.
 *
 * Saving never needs to read the library. Asking for the whole of it showed
 * iOS's "access all your photos" prompt just to save one picture, and on
 * Android it was the READ_MEDIA_* request that Google Play asks an app to
 * justify. Write-only is the add-only prompt on iOS, and on Android 13 and
 * later no prompt at all, since writing through MediaStore needs no permission.
 *
 * Returns whether saving can go ahead. Once refused for good, neither system
 * shows the prompt again, so the way out is the Settings app, offered here.
 *
 * `what` finishes "Allow Virgo to add … to your photo library".
 */
export async function canSaveToPhotos(what: string): Promise<boolean> {
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (permission.granted) return true;

  Alert.alert(
    'Saving to Photos is off',
    `Allow Virgo to add ${what} to your photo library.`,
    permission.canAskAgain
      ? [{ text: 'OK' }]
      : [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => void Linking.openSettings() },
        ],
  );
  return false;
}
