import * as ImagePicker from 'expo-image-picker';
import { NATIVE_FEATURES } from '@/src/lib/native-features';

/**
 * One photo from the camera, for the + sheet's Camera (board ChatPlus). It
 * goes to the check screen like picked photos, which shrinks it and turns a
 * HEIC into a JPEG, dropping what the camera wrote into it.
 *
 * NEEDS THE STORE BUILD. The installed builds were made without the camera
 * permission, and on iOS asking for it there ends the app, so nothing here
 * runs unless NATIVE_FEATURES.camera says this build has it.
 *
 * Null when it was put away without a photo; 'denied' when the camera is
 * switched off for Virgo, and the screen says where to switch it on.
 */
export async function takeChatPhoto(): Promise<ImagePicker.ImagePickerAsset | 'denied' | null> {
  if (!NATIVE_FEATURES.camera) return null;
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return 'denied';
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, exif: false });
  if (result.canceled || !result.assets[0]) return null;
  return result.assets[0];
}
