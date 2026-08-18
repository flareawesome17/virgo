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
          <Pressable
            key={role}
            disabled={disabled}
            onPress={() => toggle(role)}
            className={`flex-row items-center gap-1.5 rounded-full px-3.5 py-2 active:scale-[0.96] ${
              isSelected ? 'bg-action' : 'bg-card'
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
                className={`text-xs font-bold ${
                  isSelected ? 'text-white/80' : 'text-muted-foreground'
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
