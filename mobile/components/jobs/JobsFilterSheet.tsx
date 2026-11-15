import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { LocateFixedIcon, MapPinIcon, XIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { BottomSheet } from '@/components/BottomSheet';
import { usePlaceholderColor } from '@/components/Form';

for (const Icon of [LocateFixedIcon, MapPinIcon, XIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** The places most jobs are, to pick with a tap. */
const PLACES = ['Manila', 'Cebu', 'Davao'];

export interface JobFilters {
  place: string;
  roles: string[];
}

function Pick({
  label,
  on,
  onPress,
  icon,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      className={`h-10 px-3.5 rounded-full flex-row items-center gap-1.5 active:opacity-70 ${on ? 'bg-foreground' : 'bg-muted'}`}
    >
      {icon}
      <Text className={`text-[14px] ${on ? 'text-background font-semibold' : 'text-secondary-foreground font-medium'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Where, and which roles: the board's filters, with room to choose.
 *
 * The row above the list holds the same two things as chips; this is where a
 * place is typed and where more than one role is picked. Nothing changes on
 * the board until the button, so a half-typed town does not empty the list
 * behind the sheet.
 */
export function JobsFilterSheet({
  visible,
  filters,
  allRoles,
  myRoles,
  myTown,
  onApply,
  onClose,
}: {
  visible: boolean;
  filters: JobFilters;
  allRoles: string[];
  /** The roles on your profile: what "For you" means. */
  myRoles: string[];
  /** Your own town, from your profile, offered as "Near me". */
  myTown: string | null;
  onApply: (next: JobFilters) => void;
  onClose: () => void;
}) {
  const placeholder = usePlaceholderColor();
  const [place, setPlace] = useState(filters.place);
  const [roles, setRoles] = useState(filters.roles);
  useEffect(() => {
    if (!visible) return;
    setPlace(filters.place);
    setRoles(filters.roles);
    // As it opens only: the board refetching must not undo what was picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const typed = place.trim();
  const toggle = (role: string) =>
    setRoles((current) => (current.includes(role) ? current.filter((r) => r !== role) : [...current, role]));
  const changed = typed.length > 0 || roles.length > 0;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <ScrollView keyboardShouldPersistTaps="handled" bounces={false} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12, gap: 20 }}>
        <View className="flex-row items-center justify-between">
          <Text className="text-foreground text-[18px] leading-[26px] font-bold" accessibilityRole="header">
            Filter jobs
          </Text>
          {changed ? (
            <Pressable
              onPress={() => {
                setPlace('');
                setRoles([]);
              }}
              accessibilityRole="button"
              hitSlop={10}
              className="active:opacity-60"
            >
              <Text className="text-primary text-[15px] font-semibold">Clear all</Text>
            </Pressable>
          ) : null}
        </View>

        <View className="gap-2.5">
          <Text className="text-muted-foreground text-[13px] leading-[18px] font-semibold">Where</Text>
          <View className="min-h-[52px] rounded-[14px] border border-border bg-background flex-row items-center gap-2.5 pl-3.5">
            <MapPinIcon size={18} className="text-muted-foreground" />
            <TextInput
              value={place}
              onChangeText={setPlace}
              placeholder="Anywhere"
              placeholderTextColor={placeholder}
              accessibilityLabel="Town or city"
              returnKeyType="done"
              autoCorrect={false}
              className="flex-1 min-w-0 text-foreground text-[16px] py-3"
            />
            {place.length > 0 ? (
              <Pressable
                onPress={() => setPlace('')}
                accessibilityRole="button"
                accessibilityLabel="Clear the place"
                className="w-11 h-11 items-center justify-center active:opacity-60"
              >
                <XIcon size={16} className="text-muted-foreground" />
              </Pressable>
            ) : (
              <View className="w-2" />
            )}
          </View>
          <View className="flex-row flex-wrap gap-2">
            {myTown ? (
              <Pick
                label="Near me"
                on={typed.toLowerCase() === myTown.toLowerCase()}
                onPress={() => setPlace(myTown)}
                icon={
                  <LocateFixedIcon
                    size={15}
                    className={typed.toLowerCase() === myTown.toLowerCase() ? 'text-background' : 'text-secondary-foreground'}
                  />
                }
              />
            ) : null}
            <Pick label="Anywhere" on={typed.length === 0} onPress={() => setPlace('')} />
            {PLACES.filter((p) => p.toLowerCase() !== myTown?.toLowerCase()).map((p) => (
              <Pick key={p} label={p} on={typed.toLowerCase() === p.toLowerCase()} onPress={() => setPlace(p)} />
            ))}
          </View>
        </View>

        <View className="gap-2.5">
          <View className="flex-row items-baseline justify-between">
            <Text className="text-muted-foreground text-[13px] leading-[18px] font-semibold">Roles</Text>
            <Text className="text-muted-foreground text-[12px] leading-4">Pick as many as you do</Text>
          </View>
          <View className="flex-row flex-wrap gap-2">
            {allRoles.map((role) => (
              <Pick key={role} label={role} on={roles.includes(role)} onPress={() => toggle(role)} />
            ))}
          </View>
          {myRoles.length > 0 ? (
            <Text className="text-muted-foreground text-[12px] leading-4">
              “For you” is the roles on your profile: {myRoles.join(', ')}.
            </Text>
          ) : null}
        </View>

        <Pressable
          onPress={() => {
            onApply({ place: typed, roles });
            onClose();
          }}
          accessibilityRole="button"
          className="h-[52px] rounded-[14px] bg-action items-center justify-center active:opacity-85"
        >
          <Text className="text-action-foreground text-[16px] font-semibold">Show jobs</Text>
        </Pressable>
      </ScrollView>
    </BottomSheet>
  );
}
