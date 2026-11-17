import { useMemo, useState } from 'react';
import { Switch, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MapPinIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { PLAN_TYPES, PLAN_TYPE_LABEL, type PlanType } from '@/src/api';
import { useAuth, useConversation, useParticipants, useTheme } from '@/src/hooks';
import { DateTimeField } from '@/components/DateTimeField';
import {
  ChoiceChip,
  ChoiceChips,
  FormCard,
  FormFooter,
  FormInput,
  usePlaceholderColor,
} from '@/components/Form';
import { FormHeader } from '@/components/FormHeader';
import { InsetFrame } from '@/components/InsetFrame';
import { KeyboardFrame, KeyboardScroll, useKeyboardReveal } from '@/components/KeyboardForm';
import { firstNameOf } from '@/components/chat/chat-words';
import { useChatToast } from '@/components/chat/ChatToast';
import { joinNames } from '@/components/chat/cards/card-words';
import { useCardSender } from '@/components/chat/cards/useCardSender';
import { dateToKey, dateToTimeString } from '@/src/lib/calendar';
import { useDiscardGuard } from '@/src/lib/discard-guard';
import { PALETTES } from '@/theme';

cssInterop(MapPinIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/** The calendar's limits. */
const TITLE_MAX = 200;
const PLACE_MAX = 120;

/** Midnight today, so the picker cannot start on a day already gone. */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Plan a date in a chat: a shoot, a meeting, an edit, a review or a
 * delivery. It goes on your Schedule, and everyone here you are connected
 * with gets an invite they answer on the card — Going puts it on theirs.
 */
export default function PlanDateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const placeholder = usePlaceholderColor();
  const { participants } = useParticipants(id);
  const { conversation } = useConversation(id);
  const sender = useCardSender(id ?? '');
  const toast = useChatToast(12);

  const [type, setType] = useState<PlanType>('event');
  const [title, setTitle] = useState('');
  const [day, setDay] = useState<Date | null>(null);
  const [time, setTime] = useState<Date | null>(null);
  const [place, setPlace] = useState('');
  const [inviteEveryone, setInviteEveryone] = useState(true);

  const { allowLeave } = useDiscardGuard({ type, title, day: day?.getTime() ?? null, time: time?.getTime() ?? null, place });

  const isGroup = conversation?.isGroup ?? participants.length > 2;
  const names = useMemo(
    () => participants.filter((p) => p.id !== user?.id).map((p) => firstNameOf(p.name)),
    [participants, user?.id],
  );
  const directName = !isGroup ? (names[0] ?? (conversation?.title ? firstNameOf(conversation.title) : null)) : null;
  const inviteLabel = isGroup ? 'Invite everyone here' : directName ? `Invite ${directName}` : 'Invite them';
  const intro = inviteEveryone
    ? isGroup
      ? 'It goes on your Schedule, and everyone here gets an invite they answer in the chat.'
      : `It goes on your Schedule, and ${directName ?? 'they'} gets an invite to answer in the chat.`
    : 'It goes on your Schedule, and the chat sees the date.';

  const send = () => {
    if (!id || !day || sender.isPending) return;
    sender.send(
      {
        kind: 'date-plan',
        type,
        title: title.trim(),
        date: dateToKey(day),
        ...(time ? { time: dateToTimeString(time) } : {}),
        ...(place.trim() ? { place: place.trim() } : {}),
        inviteEveryone,
      },
      {
        onSuccess: () => {
          allowLeave();
          router.back();
        },
        onError: toast.show,
      },
    );
  };

  return (
    <InsetFrame edges={['top']}>
      <FormHeader title="Plan a date" />
      <KeyboardFrame>
        <View className="flex-1">
          <KeyboardScroll
            className="flex-1"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 16 }}
          >
            <Text className="text-muted-foreground text-[13px] leading-[18px]">{intro}</Text>

            <View className="gap-2">
              <Text className="text-foreground text-[13px] leading-[18px] font-semibold">What</Text>
              <FormInput
                value={title}
                onChangeText={setTitle}
                placeholder="Ocular at Sirao Garden"
                maxLength={TITLE_MAX}
                returnKeyType="done"
                accessibilityLabel="What"
                accessibilityHint={`Left empty, it is called ${PLAN_TYPE_LABEL[type]}`}
              />
            </View>

            <View accessibilityRole="radiogroup" accessibilityLabel="Kind">
              <ChoiceChips>
                {PLAN_TYPES.map((t) => (
                  <ChoiceChip key={t} label={PLAN_TYPE_LABEL[t]} selected={type === t} onPress={() => setType(t)} />
                ))}
              </ChoiceChips>
            </View>

            <FormCard>
              <DateTimeField
                row
                first
                label="Date"
                mode="date"
                value={day}
                minimumDate={startOfToday()}
                emptyLabel="Choose a day"
                onChange={(next) => next && setDay(next)}
              />
              <DateTimeField
                row
                label="Time"
                mode="time"
                value={time}
                emptyLabel="All day"
                clearable
                onChange={setTime}
              />
              <PlaceRow value={place} onChange={setPlace} placeholderColor={placeholder} />
            </FormCard>

            <View className="rounded-[20px] border border-border/40 bg-card px-4 py-2.5 flex-row items-center gap-3">
              <View className="flex-1 min-w-0">
                <Text className="text-foreground text-[15px] leading-5 font-semibold">{inviteLabel}</Text>
                {isGroup && names.length > 0 ? (
                  <Text className="text-muted-foreground text-[13px] leading-[18px]" numberOfLines={2}>
                    {joinNames(names)}
                  </Text>
                ) : null}
              </View>
              <Switch
                value={inviteEveryone}
                onValueChange={setInviteEveryone}
                accessibilityLabel={inviteLabel}
                trackColor={{ false: palette.input, true: palette.action }}
                // White, like every other switch in the app: left out, the web
                // build drew its own teal knob.
                thumbColor="#FFFFFF"
                // On iOS a switch is pinned to the left of its box; centred in
                // the row like the settings' switches.
                style={{ alignSelf: 'center' }}
              />
            </View>
          </KeyboardScroll>
          {toast.element}
        </View>

        <FormFooter
          label="Send, and add to my Schedule"
          onPress={send}
          disabled={!day}
          busy={sender.isPending}
          note={day ? undefined : 'Choose a day first'}
        />
      </KeyboardFrame>
    </InsetFrame>
  );
}

/**
 * Where, typed into the row itself as on the board. Kept above the keyboard
 * by the form like any field.
 */
function PlaceRow({
  value,
  onChange,
  placeholderColor,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholderColor: string;
}) {
  const reveal = useKeyboardReveal();
  return (
    <View className="min-h-[52px] flex-row items-center gap-3 pl-4 pr-3.5 border-t border-border/40">
      <MapPinIcon size={19} className="text-secondary-foreground" />
      <Text className="text-foreground text-[15px] font-medium">Place</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        onFocus={reveal.onFocus}
        placeholder="Optional"
        placeholderTextColor={placeholderColor}
        maxLength={PLACE_MAX}
        returnKeyType="done"
        accessibilityLabel="Place"
        textAlign="right"
        className="flex-1 min-w-0 text-foreground text-[15px] font-semibold py-3"
      />
    </View>
  );
}
