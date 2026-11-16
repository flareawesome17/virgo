import { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { GlobeIcon, LockIcon, PencilIcon, Trash2Icon, type LucideIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { BottomSheet } from '@/components/BottomSheet';

for (const Icon of [GlobeIcon, LockIcon, PencilIcon, Trash2Icon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * What can be done to a shelf of your own: rename it, change who sees it,
 * delete it.
 *
 * Each row says what will happen under its name, where that is not plain from
 * the name: making a shelf private takes it off your profile, and deleting
 * one leaves the work on it where it was. It was three bare words in a list.
 *
 * The chosen action runs once the sheet has finished closing. Each opens
 * something else — a name to type, a confirmation — and iOS will not present
 * one over a sheet that is still on its way out.
 */
export function ShelfMenuSheet({
  visible,
  name,
  isPublic,
  count,
  onClose,
  onRename,
  onTogglePrivacy,
  onDelete,
}: {
  visible: boolean;
  name: string;
  isPublic: boolean;
  /** How much is kept on it, for what Delete says it leaves alone. */
  count: number;
  onClose: () => void;
  onRename: () => void;
  onTogglePrivacy: () => void;
  onDelete: () => void;
}) {
  const chosen = useRef<(() => void) | null>(null);
  const choose = (action: () => void) => () => {
    chosen.current = action;
    onClose();
  };
  const runChosen = () => {
    const run = chosen.current;
    chosen.current = null;
    run?.();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} onClosed={runChosen}>
      <View className="px-5 min-h-8 justify-center mb-1.5">
        <Text
          accessibilityRole="header"
          className="text-foreground text-[18px] leading-[26px] font-bold"
          numberOfLines={1}
        >
          {name}
        </Text>
      </View>

      <MenuRow icon={PencilIcon} label="Rename" onPress={choose(onRename)} />
      {isPublic ? (
        <MenuRow
          icon={LockIcon}
          label="Make private"
          note="It leaves your profile. Only you will see it."
          onPress={choose(onTogglePrivacy)}
        />
      ) : (
        <MenuRow
          icon={GlobeIcon}
          label="Make public"
          note="It goes on your profile, under Taste."
          onPress={choose(onTogglePrivacy)}
        />
      )}
      <MenuRow
        icon={Trash2Icon}
        label="Delete shelf"
        note={
          count > 1
            ? `The ${count} pieces stay in the feed and on their makers’ profiles.`
            : count === 1
              ? 'The piece on it stays in the feed and on its maker’s profile.'
              : undefined
        }
        destructive
        onPress={choose(onDelete)}
      />

      <View className="px-5 pt-2 pb-3">
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          className="h-11 rounded-[14px] bg-muted items-center justify-center active:opacity-70"
        >
          <Text className="text-foreground text-[15px] font-semibold">Cancel</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

function MenuRow({
  icon: Icon,
  label,
  note,
  destructive,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  note?: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={note}
      className="flex-row items-center gap-3.5 px-5 py-2 active:opacity-70"
      style={{ minHeight: note ? 64 : 56 }}
    >
      <View
        className={`w-10 h-10 rounded-xl items-center justify-center ${
          destructive ? 'bg-destructive/10' : 'bg-muted'
        }`}
      >
        <Icon size={19} className={destructive ? 'text-destructive' : 'text-foreground'} />
      </View>
      <View className="flex-1">
        <Text
          className={`text-[15px] leading-5 font-semibold ${
            destructive ? 'text-destructive' : 'text-foreground'
          }`}
        >
          {label}
        </Text>
        {note ? (
          <Text className="text-muted-foreground text-[13px] leading-[18px]">{note}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}
