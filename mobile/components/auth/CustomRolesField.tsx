import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRoles } from '@/src/hooks';
import { FormHint, FormInput, FormLabel } from '@/components/Form';
import { RoleChip } from '@/components/auth/AuthFields';

/** The server's own limits, in auth/roles.ts. Said here so the form can refuse first. */
export const CUSTOM_ROLE_LIMIT = 3;
export const CUSTOM_ROLE_MIN = 2;
export const CUSTOM_ROLE_MAX = 40;

/**
 * Roles in somebody's own words, for the work the list has no word for.
 *
 * Beside the list, never instead of it: the list is what Nearby and the job
 * board match on, and these are shown on a profile and matched on nothing.
 * Typing a role the list already has chooses that one, spelled the list's
 * way, so there is one "Photographer" and not two.
 */
export function CustomRolesField({
  value,
  onChange,
  listed,
  onListed,
}: {
  value: string[];
  onChange: (roles: string[]) => void;
  /** The roles chosen from the list, so a typed match can join them. */
  listed: string[];
  onListed: (roles: string[]) => void;
}) {
  const { roles: all } = useRoles();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const add = () => {
    const typed = draft.trim().replace(/\s+/g, ' ');
    setError('');
    if (!typed) return;
    const same = (other: string) => other.toLowerCase() === typed.toLowerCase();
    const onList = all.find(same);
    if (onList) {
      if (!listed.includes(onList)) onListed([...listed, onList]);
      setDraft('');
      return;
    }
    if (value.some(same)) {
      setDraft('');
      return;
    }
    if (typed.length < CUSTOM_ROLE_MIN || typed.length > CUSTOM_ROLE_MAX) {
      setError(`Use ${CUSTOM_ROLE_MIN} to ${CUSTOM_ROLE_MAX} characters.`);
      return;
    }
    if (value.length >= CUSTOM_ROLE_LIMIT) {
      setError('Three is the most. Remove one to add another.');
      return;
    }
    onChange([...value, typed]);
    setDraft('');
  };

  return (
    <View className="gap-2">
      <FormLabel optional>Something else</FormLabel>
      {value.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {value.map((role) => (
            <RoleChip
              key={role}
              label={role}
              selected
              removable
              onPress={() => {
                setError('');
                onChange(value.filter((r) => r !== role));
              }}
            />
          ))}
        </View>
      ) : null}
      <View className="flex-row gap-2">
        <View className="flex-1">
          <FormInput
            value={draft}
            onChangeText={(v) => {
              setDraft(v);
              setError('');
            }}
            placeholder="Photo booth operator"
            wrong={!!error}
            maxLength={CUSTOM_ROLE_MAX}
            autoCapitalize="sentences"
            returnKeyType="done"
            onSubmitEditing={add}
            submitBehavior="submit"
            accessibilityLabel="Something else you do"
          />
        </View>
        <Pressable
          onPress={add}
          disabled={!draft.trim()}
          accessibilityRole="button"
          accessibilityLabel="Add this role"
          accessibilityState={{ disabled: !draft.trim() }}
          className="h-[52px] px-[18px] rounded-[14px] bg-secondary items-center justify-center active:opacity-80"
        >
          <Text
            className={`text-[15px] font-semibold ${draft.trim() ? 'text-foreground' : 'text-muted-foreground'}`}
          >
            Add
          </Text>
        </Pressable>
      </View>
      <FormHint wrong={!!error}>
        {error || 'In your own words, if what you do is not on the list. Up to three.'}
      </FormHint>
    </View>
  );
}
