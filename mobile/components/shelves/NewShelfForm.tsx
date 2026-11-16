import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { GlobeIcon, LockIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { FormCard, FormField, FormInput, FormLabel } from '@/components/Form';
import { Radio, SheetButton } from '@/components/shelves/ShelfBits';

for (const Icon of [GlobeIcon, LockIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * Making a shelf: its name, and who sees it.
 *
 * Who sees it is asked here rather than left for later. A shelf was always
 * made public, and one meant for a client's eyes only sat on the profile until
 * its owner found the menu that hides it.
 *
 * It fills a sheet and leaves the making to whoever shows it: the Keep sheet
 * goes on to choose the new shelf, the Taste tab only closes.
 */
export function NewShelfForm({
  onCancel,
  onSubmit,
  pending,
  onFocus,
  onBlur,
}: {
  onCancel: () => void;
  onSubmit: (shelf: { name: string; isPublic: boolean }) => void;
  /** While the shelf is being made. */
  pending: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const [name, setName] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const ready = name.trim().length > 0 && !pending;
  const submit = () => {
    if (ready) onSubmit({ name: name.trim(), isPublic });
  };

  return (
    <View className="px-5 pb-3">
      <View className="min-h-8 justify-center">
        <Text accessibilityRole="header" className="text-foreground text-[18px] leading-[26px] font-bold">
          New shelf
        </Text>
      </View>

      <View className="pt-2" style={{ gap: 18 }}>
        <FormField label="Name" hint="Name it for what it teaches you.">
          <FormInput
            value={name}
            onChangeText={setName}
            autoFocus
            maxLength={60}
            returnKeyType="done"
            onSubmitEditing={submit}
            onFocus={onFocus}
            onBlur={onBlur}
            accessibilityLabel="Shelf name"
          />
        </FormField>

        <View className="gap-2">
          <FormLabel>Who sees the shelf</FormLabel>
          <FormCard>
            <VisibilityRow
              first
              isPublic
              on={isPublic}
              onPress={() => setIsPublic(true)}
              disabled={pending}
            />
            <VisibilityRow
              isPublic={false}
              on={!isPublic}
              onPress={() => setIsPublic(false)}
              disabled={pending}
            />
          </FormCard>
        </View>

        <View className="flex-row gap-2">
          <SheetButton label="Cancel" onPress={onCancel} disabled={pending} />
          <SheetButton
            label={pending ? 'Adding…' : 'Add shelf'}
            onPress={submit}
            filled
            disabled={!ready}
            busy={pending}
          />
        </View>
      </View>
    </View>
  );
}

function VisibilityRow({
  isPublic,
  on,
  first,
  onPress,
  disabled,
}: {
  isPublic: boolean;
  on: boolean;
  first?: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const Icon = isPublic ? GlobeIcon : LockIcon;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected: on, checked: on }}
      className={`min-h-[60px] flex-row items-center gap-3 px-4 py-2 active:opacity-70 ${
        first ? '' : 'border-t border-border/40'
      }`}
    >
      <Icon size={20} className="text-secondary-foreground" />
      <View className="flex-1">
        <Text className="text-foreground text-[15px] leading-5 font-semibold">
          {isPublic ? 'Public' : 'Private'}
        </Text>
        <Text className="text-muted-foreground text-[13px] leading-[18px]">
          {isPublic ? 'On your profile, under Taste' : 'Only you'}
        </Text>
      </View>
      <Radio on={on} />
    </Pressable>
  );
}
