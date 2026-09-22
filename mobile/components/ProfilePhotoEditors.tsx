import { useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  PanResponder,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type AccessibilityActionEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { RemoteImage } from '@/components/RemoteImage';
import {
  useAuth,
  useDeleteUpload,
  useRemoveCover,
  useSetCover,
  useTheme,
  useUpload,
} from '@/src/hooks';
import { ApiError, COVER_ASPECT, coverFocusFromOffset, type UploadResult } from '@/src/api';
import {
  prepareCoverSource,
  profileActionMessage,
  renderAvatar,
  renderCover,
  type CoverSource,
} from '@/src/lib/profile-media';
import { PALETTES } from '@/theme';

/**
 * Changing the pictures on your own profile: the cover, and the photo.
 *
 * Hooks rather than screens, because both "Your profile" and Edit profile
 * offer them, and each flow has an upload, a save and an error path that must
 * behave the same wherever it is started.
 */

/** A photo taller than the cover can be dragged; one wider has nothing to place. */
function layoutFor(source: CoverSource, frameW: number, frameH: number) {
  const pans = source.height / source.width > 1 / COVER_ASPECT;
  if (pans) {
    const drawnH = (frameW * source.height) / source.width;
    return { pans, drawnW: frameW, drawnH, left: 0, maxOffset: Math.max(0, drawnH - frameH) };
  }
  const drawnW = (frameH * source.width) / source.height;
  return { pans, drawnW, drawnH: frameH, left: (frameW - drawnW) / 2, maxOffset: 0 };
}

/**
 * "Position your cover": drag the photo up or down inside the cover's shape.
 *
 * The iOS picker only crops square, so the photo is picked whole and framed
 * here instead. Where it is left is baked into the pixels before upload, which
 * is why the server stores no focus point and no surface has to agree on one.
 *
 * React Native's own PanResponder and Animated, no gesture library: this ships
 * as an update over the air, and a new native module cannot.
 */
export function CoverPositionSheet({
  visible,
  source,
  busy,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  source: CoverSource | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (focusY: number) => void;
}) {
  const { width } = useWindowDimensions();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;

  const frameW = width - 32;
  const frameH = frameW / COVER_ASPECT;
  const layout = source ? layoutFor(source, frameW, frameH) : null;
  const maxOffset = layout?.maxOffset ?? 0;

  const translateY = useRef(new Animated.Value(0)).current;
  // The committed position, and where the current drag started from. Refs,
  // because the responder is made once and must read today's values.
  const position = useRef(0);
  const dragStart = useRef(0);
  const limit = useRef(0);
  limit.current = maxOffset;

  const clamp = (y: number) => Math.min(0, Math.max(-limit.current, y));
  const moveTo = (y: number) => {
    position.current = clamp(y);
    translateY.setValue(position.current);
  };

  // Every new photo starts centred, not wherever the last one was left —
  // before paint, so the sheet never shows it at the top for a frame first.
  useLayoutEffect(() => {
    position.current = -maxOffset / 2;
    translateY.setValue(position.current);
  }, [source?.uri, maxOffset, translateY]);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => limit.current > 0,
      onMoveShouldSetPanResponder: (_e, g) => limit.current > 0 && Math.abs(g.dy) > 2,
      onPanResponderGrant: () => {
        dragStart.current = position.current;
      },
      onPanResponderMove: (_e, g) => moveTo(dragStart.current + g.dy),
      onPanResponderRelease: (_e, g) => moveTo(dragStart.current + g.dy),
      onPanResponderTerminate: (_e, g) => moveTo(dragStart.current + g.dy),
      // Keep the photo under the finger rather than handing the gesture over.
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  // Dragging is not something everyone can do: a screen reader moves it in
  // tenths with the adjustable gestures instead.
  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    const step = limit.current / 10;
    if (event.nativeEvent.actionName === 'increment') moveTo(position.current - step);
    if (event.nativeEvent.actionName === 'decrement') moveTo(position.current + step);
  };

  const close = () => {
    if (!busy) onCancel();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable className="flex-1 bg-foreground/40" onPress={close} accessibilityLabel="Close" />
      <SafeAreaView edges={['bottom']} className="bg-background rounded-t-3xl px-4">
        <View className="pt-5 pb-3">
          <Text className="text-foreground text-[17px] font-bold">Position your cover</Text>
          <Text className="text-muted-foreground text-[13px] mt-1">
            {/* A wide photo has nothing to move up or down; telling someone
                to drag it would send them hunting for a gesture that does
                nothing. */}
            {layout && !layout.pans
              ? layout.left < -0.5
                ? 'Its sides are trimmed to fit the cover.'
                : 'This photo fits the cover as it is.'
              : 'Drag the photo up or down to choose what shows.'}
          </Text>
        </View>

        <View
          className="rounded-2xl overflow-hidden bg-muted"
          style={{ width: frameW, height: frameH }}
          accessible={Boolean(layout?.pans)}
          accessibilityRole={layout?.pans ? 'adjustable' : undefined}
          accessibilityLabel="Cover position"
          accessibilityHint="Swipe up or down to move the photo."
          accessibilityActions={
            layout?.pans ? [{ name: 'increment' }, { name: 'decrement' }] : undefined
          }
          onAccessibilityAction={onAccessibilityAction}
          {...(layout?.pans ? responder.panHandlers : {})}
        >
          {source && layout && (
            <Animated.View
              style={{
                position: 'absolute',
                top: 0,
                left: layout.left,
                transform: [{ translateY }],
              }}
            >
              <RemoteImage
                source={{ uri: source.uri }}
                style={{ width: layout.drawnW, height: layout.drawnH }}
                contentFit="cover"
                transition={0}
              />
            </Animated.View>
          )}
        </View>

        <View className="flex-row gap-3 pt-4 pb-4">
          <Pressable
            onPress={close}
            disabled={busy}
            accessibilityRole="button"
            className="flex-1 bg-muted rounded-2xl py-3.5 items-center active:opacity-80"
            style={{ opacity: busy ? 0.5 : 1 }}
          >
            <Text className="text-foreground text-[15px] font-bold">Cancel</Text>
          </Pressable>
          <Pressable
            onPress={() => onConfirm(coverFocusFromOffset(position.current, limit.current))}
            disabled={busy || !source}
            accessibilityRole="button"
            accessibilityState={{ busy, disabled: busy || !source }}
            className="flex-1 bg-action rounded-2xl py-3.5 flex-row items-center justify-center gap-2 active:opacity-90"
          >
            {busy && <ActivityIndicator size="small" color={palette.actionForeground} />}
            <Text className="text-action-foreground text-[15px] font-bold">
              {busy ? 'Uploading…' : 'Use photo'}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const UNUSABLE_TITLE = "Couldn't use that photo";
const UNUSABLE_BODY = 'Try a different one.';

/**
 * Choosing, positioning and removing the cover.
 *
 * Its own upload instance, so a cover going up never turns the photo's
 * "Tap to change photo" into "Uploading…".
 */
export function useCoverEditor() {
  const upload = useUpload();
  const discard = useDeleteUpload();
  const setCover = useSetCover();
  const removeCover = useRemoveCover();
  const [preparing, setPreparing] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [source, setSource] = useState<CoverSource | null>(null);

  const choose = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo access to choose a cover.');
      return;
    }

    // Picked whole: the iOS editor only crops square, and the framing happens
    // in the sheet instead. quality 1 so the working copy starts from the
    // best there is; nothing picked here is uploaded as it is.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
      exif: false,
    });
    if (result.canceled || !result.assets?.[0]) return;

    setPreparing(true);
    try {
      setSource(await prepareCoverSource(result.assets[0].uri));
    } catch {
      Alert.alert(UNUSABLE_TITLE, UNUSABLE_BODY);
    } finally {
      setPreparing(false);
    }
  };

  const confirm = async (focusY: number) => {
    if (!source) return;
    setRendering(true);

    let rendered: { uri: string; mimeType: 'image/jpeg' };
    try {
      rendered = await renderCover(source, focusY);
    } catch {
      // Nothing is uploaded: the fallback would be the uncropped original.
      setRendering(false);
      Alert.alert(UNUSABLE_TITLE, UNUSABLE_BODY);
      return;
    }

    let uploaded: UploadResult | null = null;
    try {
      uploaded = await upload.mutateAsync({
        uri: rendered.uri,
        scope: 'covers',
        mimeType: rendered.mimeType,
        originalName: 'cover.jpg',
      });
      await setCover.mutateAsync(uploaded.key);
      setSource(null);
    } catch (err) {
      // Uploaded and confirmed but never made the cover: a public object
      // nothing points at, billed to their storage. Only on a definite
      // refusal, though: a timeout or a 5xx may be a save the server did make,
      // and discarding then deletes the cover the profile now points at. Those
      // are left to the server's stray-cover sweep on the next set or remove.
      const refused = err instanceof ApiError && err.status >= 400 && err.status < 500;
      if (uploaded && refused) discard.mutate(uploaded.key);
      Alert.alert("Couldn't update your cover", profileActionMessage(err, 'cover'));
    } finally {
      setRendering(false);
    }
  };

  const confirmRemove = () => {
    Alert.alert('Remove cover?', 'Your profile will show your work in its place.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          removeCover.mutate(undefined, {
            onError: (err) =>
              Alert.alert("Couldn't remove your cover", profileActionMessage(err, 'cover')),
          }),
      },
    ]);
  };

  const uploading = rendering || upload.isPending || setCover.isPending;
  const busy = preparing || uploading || removeCover.isPending;

  const sheet = (
    <CoverPositionSheet
      visible={source !== null}
      source={source}
      busy={uploading}
      onCancel={() => setSource(null)}
      onConfirm={confirm}
    />
  );

  return { choose, confirmRemove, busy, sheet };
}

/** Profile pictures past this are refused if they could not be scaled down. */
const AVATAR_FALLBACK_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Choosing a new profile photo: pick, scale down, upload, save.
 *
 * Its own upload and its own save, so neither Edit profile's Save button nor
 * a cover going up is mistaken for the photo changing.
 */
export function useAvatarEditor() {
  const upload = useUpload();
  const { updateProfile } = useAuth();

  const choose = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo access to set an avatar.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const scaled = await renderAvatar(asset);

    // Only reached when the shrink declined or failed — a scaled avatar is
    // well under any limit. Rejecting a 20 MP photo we could have scaled
    // would be worse than uploading it, so this guards the fallback, not the
    // happy path. Web has the same 8 MB ceiling; mobile had none at all.
    if (scaled.uri === asset.uri && (asset.fileSize ?? 0) > AVATAR_FALLBACK_MAX_BYTES) {
      Alert.alert('That image is too large', 'Profile pictures are limited to 8 MB.');
      return;
    }

    try {
      const uploaded = await upload.mutateAsync({
        uri: scaled.uri,
        scope: 'avatars',
        mimeType: scaled.mimeType,
      });
      // No CDN configured, so there is no address a profile could show it at.
      if (!uploaded.publicUrl) {
        Alert.alert("Couldn't update your photo", profileActionMessage(null, 'photo'));
        return;
      }
      await updateProfile.mutateAsync({ avatarUrl: uploaded.publicUrl });
    } catch (err) {
      Alert.alert("Couldn't update your photo", profileActionMessage(err, 'photo'));
    }
  };

  return { choose, busy: upload.isPending || updateProfile.isPending };
}
