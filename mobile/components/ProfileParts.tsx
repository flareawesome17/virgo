import { Fragment, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { CameraIcon, LayersIcon, UsersIcon, type LucideIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { RemoteImage } from '@/components/RemoteImage';
import { useTheme } from '@/src/hooks';
import {
  COVER_ASPECT,
  mutualConnectionsLine,
  profileStatsLine,
  type PortfolioAlbum,
  type PortfolioImage,
  type PortfolioItem,
  type ProfileStats,
} from '@/src/api';
import { PALETTES } from '@/theme';

// Every icon drawn here. One left out renders without its colour rather than
// failing, and nobody traces a grey icon back to this list.
for (const Icon of [CameraIcon, LayersIcon, UsersIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * The pieces "Your profile" and somebody else's profile are both made of.
 *
 * One set, so the page you see of yourself is the page a visitor sees — the
 * owner's screen only adds the edit controls on top.
 */

/** The label style every section heading on a profile uses. */
const LABEL = 'text-muted-foreground text-[11px] font-bold uppercase tracking-[2px]';

/**
 * The banner across the top, at the cover's own shape.
 *
 * Drawn at COVER_ASPECT because that is the shape the photo was cropped to on
 * the way up: any other height would crop the framing somebody chose all over
 * again. A fallback of their own work is blurred and faded, so it reads as
 * texture rather than as a cover they picked.
 */
export function ProfileCover({
  banner,
  width,
  edit,
}: {
  banner: { url: string; blurred: boolean } | null;
  width: number;
  edit?: { label: string; busy: boolean; onPress: () => void };
}) {
  const height = Math.round(width / COVER_ASPECT);
  return (
    <View className="bg-primary/10" style={{ width, height }}>
      {banner &&
        (banner.blurred ? (
          <RemoteImage
            source={{ uri: banner.url }}
            style={{ width, height, opacity: 0.5 }}
            contentFit="cover"
            blurRadius={3}
          />
        ) : (
          <RemoteImage
            source={{ uri: banner.url }}
            style={{ width, height }}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        ))}
      {edit && (
        <Pressable
          onPress={edit.onPress}
          disabled={edit.busy}
          accessibilityRole="button"
          accessibilityLabel={edit.label}
          accessibilityState={{ busy: edit.busy, disabled: edit.busy }}
          // The chip is about 32pt tall; the slop takes its target to 44.
          hitSlop={6}
          className="absolute right-3 bottom-3 rounded-full bg-background/90 px-3 py-2 flex-row items-center gap-1.5 active:opacity-80"
        >
          <CameraIcon size={14} className="text-foreground" />
          <Text className="text-foreground text-xs font-bold">
            {edit.busy ? 'Uploading…' : edit.label}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * The profile photo, ringed in the page's own background so it reads as
 * cut out of the cover it overlaps.
 *
 * Initials rather than a stock placeholder when there is none: a blank tile
 * looks like a photo that failed to load, and a letter says "not set yet".
 */
export function ProfileAvatar({
  url,
  name,
  size,
  onEdit,
  busy = false,
}: {
  url: string | null;
  name: string;
  size: number;
  onEdit?: () => void;
  busy?: boolean;
}) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const initial = (name.trim().charAt(0) || '?').toUpperCase();

  return (
    <View style={{ width: size, height: size }}>
      {/* Opaque underneath: the initials tint is translucent, and without a
          solid base the cover would show through the circle. */}
      <View
        className="bg-background overflow-hidden"
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 4,
          borderColor: palette.background,
        }}
      >
        {url ? (
          <RemoteImage source={{ uri: url }} style={{ flex: 1 }} contentFit="cover" />
        ) : (
          <View className="flex-1 bg-primary/10 items-center justify-center">
            <Text className="text-primary font-bold" style={{ fontSize: size * 0.36 }}>
              {initial}
            </Text>
          </View>
        )}
      </View>
      {onEdit && (
        <Pressable
          onPress={onEdit}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Change profile photo"
          accessibilityState={{ busy, disabled: busy }}
          hitSlop={6}
          className="absolute bottom-0 right-0 rounded-full bg-action items-center justify-center active:opacity-80"
          style={{ width: 36, height: 36, borderWidth: 3, borderColor: palette.background }}
        >
          {busy ? (
            <ActivityIndicator size="small" color={palette.actionForeground} />
          ) : (
            <CameraIcon size={15} className="text-action-foreground" />
          )}
        </Pressable>
      )}
    </View>
  );
}

/**
 * "12 connections · 4 jobs done", and the mutual count under it.
 *
 * Plain text, the mutual line included: it is a count, not a list, and a
 * tappable number that opens nobody would be a promise it cannot keep.
 * Nothing at all when the stats are unknown — an older API, or your own page
 * failing to load — rather than a row of zeros that would be untrue.
 */
export function ProfileStatsLine({
  stats,
  mutual = 0,
  className = '',
}: {
  stats: ProfileStats | null;
  mutual?: number;
  className?: string;
}) {
  if (!stats) return null;
  const mutualLine = mutualConnectionsLine(mutual);
  return (
    <View className={`gap-1 ${className}`}>
      <Text className="text-foreground text-[13px] font-semibold">{profileStatsLine(stats)}</Text>
      {mutualLine && (
        <View className="flex-row items-center gap-1.5">
          <UsersIcon size={13} className="text-muted-foreground" />
          <Text className="text-muted-foreground text-[13px]">{mutualLine}</Text>
        </View>
      )}
    </View>
  );
}

export interface ProfileDetailRow {
  /** Register it in the calling screen's cssInterop list: it is drawn by class. */
  icon: LucideIcon;
  text: string;
  sub?: string;
  tone?: 'default' | 'success' | 'link';
  onPress?: () => void;
  trailing?: ReactNode;
  accessibilityLabel?: string;
}

const TONE_TEXT = {
  default: 'text-foreground',
  success: 'text-success',
  link: 'text-primary',
} as const;

const TONE_ICON = {
  default: 'text-muted-foreground',
  success: 'text-success',
  link: 'text-primary',
} as const;

/** The facts about somebody, one row each, only the rows that apply. */
export function ProfileDetails({ rows }: { rows: ProfileDetailRow[] }) {
  if (rows.length === 0) return null;
  return (
    <View className="bg-card rounded-2xl border border-border/40 px-4">
      <Text className={`${LABEL} pt-3.5 pb-1`}>Details</Text>
      {rows.map((row, i) => {
        const tone = row.tone ?? 'default';
        const Icon = row.icon;
        const body = (
          <>
            <Icon size={16} className={TONE_ICON[tone]} />
            <View className="flex-1 min-w-0">
              <Text className={`${TONE_TEXT[tone]} text-[14px]`} numberOfLines={1}>
                {row.text}
              </Text>
              {row.sub ? (
                <Text className="text-muted-foreground text-[12px] mt-0.5">{row.sub}</Text>
              ) : null}
            </View>
          </>
        );
        const rowClass = `min-h-11 flex-row items-center gap-3 py-2.5 ${
          i < rows.length - 1 ? 'border-b border-border/30' : ''
        }`;
        // The trailing action sits beside the row, not inside it: a button
        // nested in a pressable row is one accessibility element on iOS and
        // could never be reached on its own.
        return (
          <View key={`${row.text}-${i}`} className={rowClass}>
            {row.onPress ? (
              <Pressable
                onPress={row.onPress}
                accessibilityRole="link"
                accessibilityLabel={row.accessibilityLabel ?? row.text}
                className="flex-1 min-w-0 flex-row items-center gap-3 active:opacity-70"
              >
                {body}
              </Pressable>
            ) : (
              <View className="flex-1 min-w-0 flex-row items-center gap-3">{body}</View>
            )}
            {row.trailing}
          </View>
        );
      })}
    </View>
  );
}

/**
 * The work on a profile: photos three across, then the galleries.
 *
 * `emptyState` stands in for the whole list when there is nothing in it,
 * which is also how a caller shows loading or a failed load in its place.
 */
export function PortfolioBlock({
  items,
  width,
  header,
  action,
  emptyState,
  footer,
}: {
  items: PortfolioItem[];
  width: number;
  header: string;
  action?: { label: string; onPress: () => void };
  emptyState: ReactNode;
  footer?: ReactNode;
}) {
  const images = items.filter((i): i is PortfolioImage => i.kind === 'image');
  // A gallery with no link has nowhere to open, so it is not offered.
  const albums = items.filter((i): i is PortfolioAlbum => i.kind === 'album' && Boolean(i.url));

  // Three across with 2px seams, the same grid the web profile uses. Computed
  // from the real width because a percentage leaves a sub-pixel gap that shows
  // as a hairline between tiles.
  const tile = Math.floor((width - 4) / 3);
  const empty = images.length === 0 && albums.length === 0;

  return (
    <View className="mt-6">
      <View className="flex-row items-center justify-between px-5 mb-2">
        <Text className={LABEL}>{header}</Text>
        {action && (
          <Pressable onPress={action.onPress} accessibilityRole="button" hitSlop={13}>
            <Text className="text-primary text-[13px] font-semibold">{action.label}</Text>
          </Pressable>
        )}
      </View>

      {empty ? (
        <View className="px-5">{emptyState}</View>
      ) : (
        <Fragment>
          {images.length > 0 && (
            <View className="flex-row flex-wrap" style={{ gap: 2 }}>
              {images.map((item) => (
                <RemoteImage
                  key={item.id}
                  source={{ uri: item.url }}
                  style={{ width: tile, height: tile }}
                  contentFit="cover"
                  accessibilityLabel={item.caption ?? undefined}
                />
              ))}
            </View>
          )}

          {albums.length > 0 && (
            <View className="mt-6 px-5 gap-2.5">
              <Text className={LABEL}>Galleries</Text>
              {albums.map((album) => (
                <Pressable
                  key={album.id}
                  className="rounded-2xl overflow-hidden bg-card active:opacity-90"
                  accessibilityRole="link"
                  accessibilityLabel={`${album.name}, ${album.itemCount} ${album.itemCount === 1 ? 'photo' : 'photos'}`}
                  onPress={() => album.url && Linking.openURL(album.url)}
                >
                  {album.coverUrl ? (
                    <RemoteImage
                      source={{ uri: album.coverUrl }}
                      style={{ width: '100%', height: 140 }}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={{ height: 140 }} className="bg-primary/10 items-center justify-center">
                      <LayersIcon size={26} className="text-primary" />
                    </View>
                  )}
                  <View className="p-3.5">
                    <Text className="text-foreground text-[14px] font-bold">{album.name}</Text>
                    <Text className="text-muted-foreground text-[11px] mt-0.5">
                      {album.itemCount} {album.itemCount === 1 ? 'photo' : 'photos'}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </Fragment>
      )}

      {footer}
    </View>
  );
}
