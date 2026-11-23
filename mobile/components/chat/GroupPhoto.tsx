import * as ImagePicker from 'expo-image-picker';
import { useUpload } from '@/src/hooks';
import { useUpdateGroup } from '@/src/hooks/useChatCrew';
import { profileActionMessage, renderAvatar } from '@/src/lib/profile-media';
import { groupError } from './chat-words';

/** Past this, a photo that could not be scaled down is refused, as for a profile photo. */
const PHOTO_FALLBACK_MAX_BYTES = 8 * 1024 * 1024;

/**
 * A failed upload, said the way a profile photo's is — storage full, offline,
 * a photo that can't be used — except that the catch-all names the group's
 * photo, not "your photo".
 */
function uploadFailure(err: unknown): string {
  const words = profileActionMessage(err, 'photo');
  return words === profileActionMessage(null, 'photo') ? "Couldn't change the group photo. Try again." : words;
}

/**
 * A group's photo, chosen and put up the way a profile photo is: picked
 * square, scaled down to avatar size, uploaded as an avatar, then set on the
 * group. The server only takes a photo from your own avatars, and deletes the
 * one it replaces.
 *
 * Avatar-sized on purpose: it loads on any connection, like a profile picture.
 * What goes wrong is said through `notify`, the screen's toast.
 */
export function useGroupPhotoEditor(conversationId: string, notify: (words: string) => void) {
  const upload = useUpload();
  const update = useUpdateGroup(conversationId);

  // No permission asked: the system picker hands over only what is chosen.
  const choose = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const scaled = await renderAvatar(asset);
    if (scaled.uri === asset.uri && (asset.fileSize ?? 0) > PHOTO_FALLBACK_MAX_BYTES) {
      notify('That image is too large. Group photos are limited to 8 MB.');
      return;
    }

    let photoUrl: string | null = null;
    try {
      const uploaded = await upload.mutateAsync({
        uri: scaled.uri,
        scope: 'avatars',
        mimeType: scaled.mimeType,
      });
      photoUrl = uploaded.publicUrl ?? null;
    } catch (err) {
      notify(uploadFailure(err));
      return;
    }
    // No CDN configured: there is no address the group could show it at.
    if (!photoUrl) {
      notify(uploadFailure(null));
      return;
    }
    update.mutate({ photoUrl }, { onError: (err) => notify(groupError(err)) });
  };

  /** Asked from the photo's own menu, which is the confirmation. */
  const remove = () => {
    update.mutate({ photoUrl: null }, { onError: (err) => notify(groupError(err)) });
  };

  return { choose, remove, busy: upload.isPending || update.isPending };
}
