import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { ChevronDownIcon, ChevronUpIcon, InfoIcon, SearchIcon, XIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useTheme } from '@/src/hooks';
import { PALETTES } from '@/theme';

for (const Icon of [ChevronDownIcon, ChevronUpIcon, InfoIcon, SearchIcon, XIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** Searching one chat: the thread's header becomes the box, with Done to go back. */
export function ChatSearchHeader({
  value,
  onChangeText,
  onDone,
  autoFocus,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onDone: () => void;
  autoFocus: boolean;
}) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  return (
    <View className="min-h-[56px] pl-3 pr-1 py-1.5 flex-row items-center gap-2">
      <View className="flex-1 h-11 rounded-[14px] bg-muted flex-row items-center gap-2.5 pl-3.5 pr-1.5">
        <SearchIcon size={18} className="text-muted-foreground" />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="Search this chat"
          placeholderTextColor={palette.mutedForeground}
          accessibilityLabel="Search this chat"
          autoFocus={autoFocus}
          autoCorrect={false}
          returnKeyType="search"
          className="flex-1 text-foreground text-[15px]"
        />
        {value.length > 0 ? (
          <Pressable
            onPress={() => onChangeText('')}
            accessibilityRole="button"
            accessibilityLabel="Clear"
            className="w-8 h-8 items-center justify-center active:opacity-60"
          >
            <XIcon size={16} className="text-muted-foreground" />
          </Pressable>
        ) : null}
      </View>
      <Pressable
        onPress={onDone}
        accessibilityRole="button"
        accessibilityHint="Goes back to the latest messages"
        className="h-11 px-2.5 items-center justify-center active:opacity-60"
      >
        <Text className="text-primary text-[15px] font-semibold">Done</Text>
      </Pressable>
    </View>
  );
}

/**
 * "2 of 5 in Marco Uy", and the arrows: up for older, down for newer. The
 * matches are newest first, so 1 is the latest.
 */
export function ChatSearchCount({
  where,
  term,
  total,
  at,
  loading,
  failed,
  onOlder,
  onNewer,
}: {
  /** The chat's name, as the header said it. */
  where: string;
  term: string;
  total: number;
  /** Which match is showing, from 0 (the newest). */
  at: number;
  loading: boolean;
  failed: boolean;
  onOlder: () => void;
  onNewer: () => void;
}) {
  const hasOlder = total > 0 && at < total - 1;
  const hasNewer = total > 0 && at > 0;
  let line: ReactNode;
  if (!term) {
    line = <Text className="text-muted-foreground text-[14px]">Type to search what was said here</Text>;
  } else if (loading && total === 0) {
    line = <Text className="text-muted-foreground text-[14px]">Searching…</Text>;
  } else if (failed && total === 0) {
    line = (
      <Text className="text-muted-foreground text-[14px]" numberOfLines={1}>
        {"Couldn't search. Check your connection."}
      </Text>
    );
  } else if (total === 0) {
    line = (
      <Text className="text-foreground text-[14px] font-semibold" numberOfLines={1}>
        No matches <Text className="font-normal text-muted-foreground">in {where}</Text>
      </Text>
    );
  } else {
    line = (
      <Text
        className="text-foreground text-[14px] font-semibold"
        numberOfLines={1}
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {at + 1} of {total}
        {total >= 200 ? '+' : ''} <Text className="font-normal text-muted-foreground">in {where}</Text>
      </Text>
    );
  }
  return (
    <View
      className="h-12 pl-5 pr-1 flex-row items-center gap-1 border-b border-border/50"
      accessibilityLiveRegion="polite"
    >
      <View className="flex-1 min-w-0 flex-row items-center gap-2">
        {line}
        {loading && total > 0 ? <ActivityIndicator size="small" /> : null}
      </View>
      <Pressable
        onPress={onOlder}
        disabled={!hasOlder}
        accessibilityRole="button"
        accessibilityLabel="Older match"
        accessibilityState={{ disabled: !hasOlder }}
        className="w-11 h-11 items-center justify-center active:opacity-60"
        style={{ opacity: hasOlder ? 1 : 0.35 }}
      >
        <ChevronUpIcon size={20} className="text-foreground" />
      </Pressable>
      <Pressable
        onPress={onNewer}
        disabled={!hasNewer}
        accessibilityRole="button"
        accessibilityLabel="Newer match"
        accessibilityState={{ disabled: !hasNewer }}
        className="w-11 h-11 items-center justify-center active:opacity-60"
        style={{ opacity: hasNewer ? 1 : 0.35 }}
      >
        <ChevronDownIcon size={20} className="text-foreground" />
      </Pressable>
    </View>
  );
}

/** Where the composer was, while searching. */
export function ChatSearchFooter({ bottomInset }: { bottomInset: number }) {
  return (
    <View
      className="px-5 pt-3 flex-row items-center gap-2.5 border-t border-border/50"
      style={{ paddingBottom: bottomInset + 12 }}
    >
      <InfoIcon size={16} className="text-muted-foreground" />
      <Text className="flex-1 text-muted-foreground text-[13px] leading-[18px]">
        Searching the list finds this chat too, and opens it here
      </Text>
    </View>
  );
}
