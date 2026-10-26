import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronRightIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { formatBytes, type UsageSummary } from '@/src/api';
import { useTheme } from '@/src/hooks';
import { CHART_COLORS, PALETTES } from '@/theme';

cssInterop(ChevronRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/** One kind of file and what it takes up, from the storage breakdown. */
export interface StoredKind {
  kind: string;
  bytes: number;
}

const KIND_LABEL: Record<string, string> = {
  image: 'Photos',
  video: 'Videos',
  audio: 'Audio',
  other: 'Other',
};

/** The order the bar and its legend list them in, largest share first by habit. */
const KIND_ORDER = ['image', 'video', 'audio', 'other'];

/**
 * "Your plan" on the Dashboard: what the account has used of everything the
 * plan limits.
 *
 * Storage as one bar split by kind, so it says what is filling it as well as
 * how full it is; the month's client downloads, which turn red from 80% and
 * say when they reset, or that they are paused; and the two counts the plan
 * caps. It was all on Storage behind Settings, which is where the first sign
 * of the download allowance turned out to be a client's screenshot.
 *
 * Takes plain figures, so it draws the same for a preview as for the account.
 */
export function PlanCard({
  usage,
  byKind,
}: {
  usage: UsageSummary;
  /** Bytes by kind. Empty draws the storage bar in one colour. */
  byKind: StoredKind[];
}) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const color: Record<string, string> = {
    image: palette.primary,
    video: CHART_COLORS.blue,
    audio: CHART_COLORS.green,
    other: palette.mutedForeground,
  };

  const { usedBytes, limitBytes } = usage.storage;
  const kinds = KIND_ORDER.map((kind) => ({
    kind,
    bytes: byKind.find((k) => k.kind === kind)?.bytes ?? 0,
  })).filter((k) => k.bytes > 0);
  // Against the limit when there is one; an unlimited plan's bar is the
  // split alone, full width.
  const scale = limitBytes ?? Math.max(usedBytes, 1);

  const downloads = usage.downloads ?? null;
  const dlLimit = downloads?.limitBytes ?? null;
  const dlFraction = downloads && dlLimit ? downloads.usedBytes / dlLimit : 0;
  const paused = dlLimit != null && !!downloads && downloads.usedBytes >= dlLimit;
  // Named in UTC: the count starts again at midnight UTC on the 1st, which
  // read as "Oct 31" west of Greenwich in the phone's own zone.
  const reset = downloads
    ? new Date(downloads.resetsAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : '';

  return (
    <Pressable
      onPress={() => router.push('/settings/storage')}
      accessibilityRole="button"
      accessibilityLabel={`Your plan. Storage ${formatBytes(usedBytes)}${limitBytes != null ? ` of ${formatBytes(limitBytes)}` : ''}.${
        downloads ? ` Client downloads ${formatBytes(downloads.usedBytes)}${dlLimit != null ? ` of ${formatBytes(dlLimit)}` : ''} this month.` : ''
      }`}
      className="bg-card rounded-2xl border border-border/40 p-4 gap-4 active:opacity-90"
    >
      {/* Storage */}
      <View>
        <View className="flex-row items-baseline justify-between">
          <Text className="text-foreground text-sm font-semibold">Storage</Text>
          <Text className="text-foreground text-sm font-bold">
            {formatBytes(usedBytes)}
            {limitBytes != null && (
              <Text className="text-muted-foreground text-xs font-medium"> of {formatBytes(limitBytes)}</Text>
            )}
          </Text>
        </View>
        <View className="h-2 rounded-full bg-muted mt-2 overflow-hidden flex-row" style={{ gap: 2 }}>
          {kinds.length > 0 ? (
            kinds.map((k) => (
              <View
                key={k.kind}
                style={{ width: `${Math.max((k.bytes / scale) * 100, 1)}%`, backgroundColor: color[k.kind] ?? palette.primary }}
              />
            ))
          ) : (
            <View style={{ width: `${Math.min((usedBytes / scale) * 100, 100)}%`, backgroundColor: palette.primary }} />
          )}
        </View>
        {kinds.length > 0 && (
          <View className="flex-row flex-wrap mt-2" style={{ columnGap: 12, rowGap: 4 }}>
            {kinds.map((k) => (
              <View key={k.kind} className="flex-row items-center gap-1.5">
                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color[k.kind] ?? palette.primary }} />
                <Text className="text-muted-foreground text-xs">
                  {KIND_LABEL[k.kind] ?? k.kind} {formatBytes(k.bytes)}
                </Text>
              </View>
            ))}
          </View>
        )}
        {!!usage.bonus?.storageBytes && (
          <Text className="text-muted-foreground text-xs mt-1">
            Includes {formatBytes(usage.bonus.storageBytes)} from rewards
          </Text>
        )}
      </View>

      {/* Client downloads this month */}
      {downloads && (
        <View>
          <View className="flex-row items-baseline justify-between">
            <Text className="text-foreground text-sm font-semibold">Client downloads</Text>
            <Text className="text-foreground text-sm font-bold">
              {formatBytes(downloads.usedBytes)}
              {dlLimit != null && (
                <Text className="text-muted-foreground text-xs font-medium"> of {formatBytes(dlLimit)}</Text>
              )}
            </Text>
          </View>
          {dlLimit != null && (
            <View className="h-2 rounded-full bg-muted mt-2 overflow-hidden">
              <View
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(dlFraction * 100, 100)}%`,
                  backgroundColor: dlFraction >= 0.8 ? palette.destructive : palette.primary,
                }}
              />
            </View>
          )}
          <Text className={`text-xs mt-1.5 ${paused ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
            {paused ? `Paused until ${reset}` : `This month · resets ${reset}`}
          </Text>
        </View>
      )}

      {/* What the plan counts */}
      <View className="flex-row gap-2.5">
        <View className="flex-1 rounded-xl bg-muted/60 px-3 py-2.5">
          <Text className="text-foreground text-base font-bold">
            {usage.workspaces.limit != null
              ? `${usage.workspaces.used} of ${usage.workspaces.limit}`
              : usage.workspaces.used}
          </Text>
          <Text className="text-muted-foreground text-xs mt-0.5">Workspaces</Text>
        </View>
        <View className="flex-1 rounded-xl bg-muted/60 px-3 py-2.5">
          <Text className="text-foreground text-base font-bold">{usage.albums.used}</Text>
          <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
            {usage.albums.limit != null ? `Albums · ${usage.albums.limit} per workspace` : 'Albums'}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center justify-end gap-1 -mt-1">
        <Text className="text-primary text-xs font-semibold">Storage and plan</Text>
        <ChevronRightIcon size={13} className="text-primary" />
      </View>
    </Pressable>
  );
}
