import { Pressable, Text, View } from 'react-native';
import { PlusIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { ChoiceChip, ChoiceChips, FormInput, FormLabel } from '@/components/Form';

cssInterop(PlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/** How much of a field's room is used, beside its label or under it. */
export function Count({ used, of }: { used: number; of: string }) {
  return (
    <Text className="text-muted-foreground text-[12px] leading-4">
      {used.toLocaleString('en-US')} of {of}
    </Text>
  );
}

/**
 * The craft note and its tags: the field the whole feed is for.
 *
 * It has its own place rather than being folded into the caption, because a
 * caption says what this is, and the note says what somebody else could do
 * with it.
 */
export function CraftSection({
  note,
  onNote,
  tags,
  choices,
  maxTags,
  maxTagLength,
  onToggleTag,
  draft,
  onDraft,
  onAddDraft,
}: {
  note: string;
  onNote: (next: string) => void;
  tags: string[];
  /** The suggestions, led by anything chosen that is not among them. */
  choices: string[];
  maxTags: number;
  maxTagLength: number;
  onToggleTag: (tag: string) => void;
  draft: string;
  onDraft: (next: string) => void;
  onAddDraft: () => void;
}) {
  const full = tags.length >= maxTags;
  const cannotAdd = !draft.trim() || full;
  return (
    <>
      <View className="gap-2.5">
        <View className="gap-0.5">
          <Text
            accessibilityRole="header"
            className="text-foreground text-[17px] leading-6 font-bold tracking-[-0.2px]"
          >
            How it was made
          </Text>
          <Text className="text-muted-foreground text-[13px] leading-[18px]">
            One thing another photographer could use. This is what turns a scroll into
            something worth keeping.
          </Text>
        </View>
        <FormInput
          value={note}
          onChangeText={onNote}
          placeholder="Backlit into the storm front so the rain read as light, not weather."
          multiline
          minHeight={118}
          maxLength={600}
          accessibilityLabel="How it was made"
        />
        <View className="self-end">
          <Count used={note.length} of="600" />
        </View>
      </View>

      <View className="gap-2.5">
        <View className="flex-row items-baseline justify-between">
          <FormLabel>Tags</FormLabel>
          <Count used={tags.length} of={String(maxTags)} />
        </View>
        <ChoiceChips>
          {choices.map((tag) => (
            <ChoiceChip
              key={tag}
              label={tag}
              selected={tags.includes(tag)}
              onPress={() => onToggleTag(tag)}
              multiple
            />
          ))}
        </ChoiceChips>
        {/* Your own, for what none of the suggestions say. */}
        <View>
          <FormInput
            value={draft}
            onChangeText={onDraft}
            placeholder="Add your own tag"
            maxLength={maxTagLength}
            returnKeyType="done"
            onSubmitEditing={onAddDraft}
            editable={!full}
            accessibilityLabel="Add your own tag"
            // Room for the plus, which sits inside the field's right end.
            style={{ paddingRight: 36 }}
          />
          <Pressable
            onPress={onAddDraft}
            disabled={cannotAdd}
            accessibilityRole="button"
            accessibilityLabel="Add this tag"
            accessibilityState={{ disabled: cannotAdd }}
            hitSlop={8}
            className="absolute right-2 top-2 w-9 h-9 rounded-[10px] bg-muted items-center justify-center active:opacity-70"
            style={{ opacity: cannotAdd ? 0.45 : 1 }}
          >
            <PlusIcon size={18} className="text-foreground" />
          </Pressable>
        </View>
        <Text className="text-muted-foreground text-[12px] leading-4">
          Typed by you, never read off the file. What your camera recorded about where you
          were stays private.
        </Text>
      </View>
    </>
  );
}
