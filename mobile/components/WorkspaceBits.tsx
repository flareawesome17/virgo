import { Modal, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRef, type ReactNode } from 'react';
import { CheckIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { RemoteImage } from '@/components/RemoteImage';

cssInterop(CheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/** Two letters from a name, for an avatar with no photograph. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : name.slice(0, 2);
  return letters.toUpperCase();
}

/**
 * A workspace's letter on its colour: the mark that stands for it on cards,
 * headers and pickers. The colour is the owner's choice, so it is data.
 */
export function WorkspaceTile({
  name,
  color,
  size = 48,
}: {
  name: string;
  color: string;
  size?: number;
}) {
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.27),
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#FFFFFF', fontSize: Math.round(size * 0.42), fontWeight: '700' }}>
        {name.trim().charAt(0).toUpperCase() || '·'}
      </Text>
    </View>
  );
}

export function PersonAvatar({
  name,
  url,
  size = 36,
  ring,
}: {
  name: string;
  url?: string | null;
  size?: number;
  /** A border in this colour, for faces that overlap. */
  ring?: string;
}) {
  const frame = {
    width: size,
    height: size,
    borderRadius: size / 2,
    ...(ring ? { borderWidth: 2, borderColor: ring } : {}),
  };
  if (url) return <RemoteImage source={{ uri: url }} style={frame} />;
  return (
    <View className="bg-primary/15 items-center justify-center" style={frame}>
      <Text className="text-primary font-bold" style={{ fontSize: Math.max(9, Math.round(size * 0.34)) }}>
        {initials(name)}
      </Text>
    </View>
  );
}

/** Overlapping faces for the people in a workspace. */
export function PeopleStack({
  people,
  ring,
  size = 22,
  max = 4,
}: {
  people: { name: string; avatar_url: string | null }[];
  /** The surface behind them, which each face is ringed in. */
  ring: string;
  size?: number;
  max?: number;
}) {
  if (people.length === 0) return null;
  const shown = people.slice(0, max);
  const more = people.length - shown.length;
  return (
    <View
      className="flex-row items-center"
      accessible
      accessibilityLabel={people.map((p) => p.name).join(', ')}
    >
      {shown.map((person, i) => (
        <View key={`${person.name}-${i}`} style={{ marginLeft: i === 0 ? 0 : -Math.round(size * 0.3) }}>
          <PersonAvatar name={person.name} url={person.avatar_url} size={size} ring={ring} />
        </View>
      ))}
      {more > 0 && <Text className="text-muted-foreground text-[11px] ml-1">+{more}</Text>}
    </View>
  );
}

/** A small rounded label: "Waiting", "Declined", "You can upload". */
export function Pill({
  children,
  tone = 'primary',
}: {
  children: ReactNode;
  tone?: 'primary' | 'warning' | 'muted' | 'info';
}) {
  const tones = {
    primary: ['bg-primary/15', 'text-primary'],
    warning: ['bg-warning/15', 'text-warning'],
    muted: ['bg-muted', 'text-muted-foreground'],
    info: ['bg-info/15', 'text-info'],
  } as const;
  const [bg, fg] = tones[tone];
  return (
    <View className={`rounded-full px-2 py-0.5 ${bg}`}>
      <Text className={`text-[11px] font-bold ${fg}`}>{children}</Text>
    </View>
  );
}

/**
 * A bottom sheet of actions. Alert cannot stand in: Android shows at most
 * three buttons, and a workspace's options are more than that.
 *
 * On iOS the chosen action runs once the sheet has finished closing. Most of
 * these open something else — a confirmation, another screen — and iOS will
 * not present an alert over a modal that is still on its way out.
 */
export function ActionSheet({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title: string;
  actions: { label: string; destructive?: boolean; onPress: () => void }[];
  onClose: () => void;
}) {
  const chosen = useRef<(() => void) | null>(null);
  const runChosen = () => {
    const run = chosen.current;
    chosen.current = null;
    run?.();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={runChosen}
    >
      <Pressable className="flex-1 bg-foreground/40" onPress={onClose} accessibilityLabel="Close" />
      <SafeAreaView edges={['bottom']} className="bg-card rounded-t-3xl">
        <View className="px-5 pt-5 pb-3">
          <Text className="text-muted-foreground text-xs font-semibold mb-1" numberOfLines={1}>
            {title}
          </Text>
          {actions.map((action) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              onPress={() => {
                chosen.current = action.onPress;
                onClose();
                // onDismiss is iOS-only; Android has nothing to wait for.
                if (Platform.OS !== 'ios') runChosen();
              }}
              className="py-3.5 active:opacity-70"
            >
              <Text
                className={`text-base font-semibold ${action.destructive ? 'text-destructive' : 'text-foreground'}`}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" onPress={onClose} className="py-3.5 active:opacity-70">
            <Text className="text-muted-foreground text-base">Cancel</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

/**
 * A bottom sheet of choices, the current one ticked. For picking one of a few
 * short options on a phone, where a dropdown costs a modal anyway.
 */
export function ChoiceSheet<T extends string>({
  visible,
  title,
  hint,
  options,
  value,
  onChoose,
  onClose,
}: {
  visible: boolean;
  title: string;
  hint?: string;
  options: { value: T; label: string; description?: string }[];
  value: T | null;
  onChoose: (value: T) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-foreground/40" onPress={onClose} accessibilityLabel="Close" />
      <SafeAreaView edges={['bottom']} className="bg-card rounded-t-3xl">
        <View className="px-5 pt-5 pb-3">
          <Text className="text-foreground text-lg font-bold" accessibilityRole="header">
            {title}
          </Text>
          {hint ? <Text className="text-muted-foreground text-xs mt-1">{hint}</Text> : null}
          <View className="mt-3">
            {options.map((option) => {
              const on = option.value === value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => {
                    onChoose(option.value);
                    onClose();
                  }}
                  className="flex-row items-center gap-3 py-3 active:opacity-70"
                >
                  <View className="flex-1">
                    <Text className={`text-base ${on ? 'text-foreground font-bold' : 'text-foreground'}`}>
                      {option.label}
                    </Text>
                    {option.description ? (
                      <Text className="text-muted-foreground text-xs mt-0.5">{option.description}</Text>
                    ) : null}
                  </View>
                  {on && <CheckIcon size={18} className="text-primary" />}
                </Pressable>
              );
            })}
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
