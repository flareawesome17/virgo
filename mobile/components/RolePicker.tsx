import { View, Text, Pressable } from 'react-native';
import { CheckIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useRoles } from '@/src/hooks';

cssInterop(CheckIcon, {
  className: { target: 'style', nativeStyleToProp: { color: true } },
});

/**
 * Picks what someone does on a shoot.
 *
 * Chips rather than a list of switches: holding several is normal — a
 * photographer who also cuts the same-day edit holds both — and a control
 * where that reads as an exception gets filled in wrong.
 *
 * Shared by the profile editor, the prompt shown to accounts that predate
 * roles, and the Nearby filter, so all three offer exactly the same thing.
 */
export function RolePicker({
  selected,
  onChange,
  /** Renders counts beside each role, e.g. how many are nearby. */
  counts,
  disabled,
}: {
  selected: string[];
  onChange: (roles: string[]) => void;
  counts?: Record<string, number>;
  disabled?: boolean;
}) {
  const { roles, isLoading } = useRoles();

  if (isLoading && roles.length === 0) {
    return <Text className="text-muted-foreground text-sm">Loading roles…</Text>;
  }

  const toggle = (role: string) =>
    onChange(
      selected.includes(role)
        ? selected.filter((r) => r !== role)
        : [...selected, role],
    );

  return (
    <View className="flex-row flex-wrap gap-2">
      {roles.map((role) => {
        const isSelected = selected.includes(role);
        const count = counts?.[role];
        // Only when counts were asked for: a role nobody nearby does is worth
        // showing greyed rather than hiding, or the list changes shape as
        // people move around.
        const empty = counts !== undefined && !count;

        return (
          // The same width either way. The tick on a chosen chip made it
          // wider, so choosing one pushed the rest of the row along, and
          // could move the chip you were about to tap. A chosen chip trades
          // padding for the tick: 12 + tick 12 + gap 4 + 12, against 20 + 20.
          <Pressable
            key={role}
            disabled={disabled}
            onPress={() => toggle(role)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSelected, disabled }}
            accessibilityLabel={counts !== undefined ? `${role}, ${count ?? 0}` : role}
            hitSlop={{ top: 4, bottom: 4 }}
            className={`flex-row items-center gap-1 rounded-full py-2.5 active:scale-[0.96] ${
              isSelected ? 'bg-action px-3' : 'bg-card px-5'
            }`}
            style={{
              opacity: disabled ? 0.5 : empty && !isSelected ? 0.55 : 1,
              ...(isSelected
                ? {}
                : {
                    shadowColor: '#000',
                    shadowOpacity: 0.03,
                    shadowRadius: 4,
                    shadowOffset: { width: 0, height: 1 },
                    elevation: 1,
                  }),
            }}
          >
            {isSelected && <CheckIcon size={12} className="text-white" />}
            <Text
              className={`text-xs font-semibold ${
                isSelected ? 'text-white' : 'text-foreground'
              }`}
            >
              {role}
            </Text>
            {counts !== undefined && (
              <Text
                className={`text-xs font-bold ml-0.5 ${
                  isSelected ? 'text-white' : 'text-muted-foreground'
                }`}
              >
                {count ?? 0}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
