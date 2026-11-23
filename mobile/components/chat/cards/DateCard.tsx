import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { CalendarCheckIcon, CalendarXIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  myPlanAnswer,
  planBadge,
  planTally,
  planWhenLine,
  type DatePlanCardContext,
} from '@/src/api';
import { useAnswerDate } from '@/src/hooks/useChatCards';
import { PALETTES } from '@/theme';
import { useTheme } from '@/src/hooks';
import { ChatAvatar } from '../ChatAvatar';
import { answerError, firstNameFor, joinNames, type ChatPeople } from './card-words';
import { CardFrame, CardGone, holdActions } from './CardFrame';
import type { CardProps } from './types';

for (const Icon of [CalendarCheckIcon, CalendarXIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

const WIDTH = 288;
/** How many faces of who is going, before the count says the rest. */
const FACES = 4;

type Plan = NonNullable<DatePlanCardContext['plan']>;

/**
 * "3 going · Bea can't", and for the organiser "· 1 hasn't said". Two or
 * fewer who can't are named; more are counted.
 */
function tallyWords(plan: Plan, people: ChatPeople, organiser: boolean): { going: string | null; rest: string } {
  const { going, cant, waiting } = planTally(plan);
  const parts: string[] = [];
  if (cant.length > 0) {
    parts.push(
      cant.length <= 2 ? `${joinNames(cant.map((id) => firstNameFor(people, id)))} can't` : `${cant.length} can't`,
    );
  }
  if (organiser && waiting.length > 0) {
    parts.push(`${waiting.length} ${waiting.length === 1 ? "hasn't" : "haven't"} said`);
  }
  if (going.length > 0) return { going: `${going.length} going`, rest: parts.join(' · ') };
  if (plan.answers.length === 0) {
    return { going: null, rest: organiser ? 'Only on your Schedule' : 'No invites with it' };
  }
  return { going: null, rest: parts.join(' · ') || 'Nobody has answered yet' };
}

/**
 * A date planned in the chat: the day as a badge, what and when, and who is
 * coming. Somebody invited answers on the card — Going puts it on their
 * Schedule — and can change their mind. The organiser, and anyone the
 * organiser is not connected with (who was not invited), see the count.
 */
export function DateCard({
  message,
  mine,
  senderName,
  meta,
  cardRef,
  onHold,
  pills,
  myId,
  people,
  autoLoadMedia,
  notify,
}: CardProps) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const answer = useAnswerDate(message.conversation_id);
  const plan = ((message.context ?? null) as DatePlanCardContext | null)?.plan;

  if (!plan) {
    const words = 'This date was removed.';
    return (
      <CardFrame ref={cardRef} mine={mine} senderName={senderName} meta={meta} width={WIDTH} onHold={onHold} pills={pills}>
        <View accessible accessibilityLabel={`Date. ${words} ${meta}`} {...holdActions(onHold)}>
          <CardGone words={words} />
        </View>
      </CardFrame>
    );
  }

  const badge = planBadge(plan.date);
  const when = planWhenLine(plan);
  const organiser = !!myId && plan.organiserId === myId;
  const mineAnswer = organiser ? null : myPlanAnswer(plan, myId);
  const { going } = planTally(plan);
  const tally = tallyWords(plan, people, organiser);
  const busyGoing = answer.isPending ? answer.variables?.going : undefined;

  const reply = (goingNow: boolean) => {
    if (answer.isPending) return;
    answer.mutate(
      { messageId: message.id, going: goingNow },
      { onError: (err) => notify(answerError(err)) },
    );
  };

  const summary = [
    'Date',
    plan.title,
    when,
    mineAnswer === 'accepted'
      ? "You're going"
      : mineAnswer === 'declined'
        ? "You can't go"
        : mineAnswer === 'pending'
          ? 'You are invited'
          : [tally.going, tally.rest].filter(Boolean).join(', '),
    meta,
  ].join('. ');

  return (
    <CardFrame ref={cardRef} mine={mine} senderName={senderName} meta={meta} width={WIDTH} onHold={onHold} pills={pills}>
      <View accessible accessibilityLabel={summary} {...holdActions(onHold)} className="flex-row items-center gap-3">
        <View
          className={`rounded-[14px] items-center justify-center ${mine ? 'bg-primary/10' : 'bg-muted'}`}
          style={{ width: 52, height: 56 }}
        >
          <Text
            className={`text-[11px] leading-[14px] font-bold ${mine ? 'text-primary' : 'text-muted-foreground'}`}
            allowFontScaling={false}
          >
            {badge?.month ?? ''}
          </Text>
          <Text className="text-foreground text-[22px] leading-[26px] font-bold" allowFontScaling={false}>
            {badge?.day ?? ''}
          </Text>
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-foreground text-[15px] leading-5 font-bold" numberOfLines={2}>
            {plan.title}
          </Text>
          <Text className="text-secondary-foreground text-[13px] leading-[18px]" numberOfLines={2}>
            {when}
          </Text>
        </View>
      </View>

      {mineAnswer === 'pending' ? (
        <View className="mt-2.5 gap-2.5">
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => reply(true)}
              onLongPress={onHold}
              delayLongPress={300}
              disabled={answer.isPending}
              accessibilityRole="button"
              accessibilityLabel={`Going to ${plan.title}`}
              accessibilityState={{ busy: busyGoing === true, disabled: answer.isPending }}
              className="flex-1 h-11 rounded-[14px] bg-action flex-row items-center justify-center gap-2 active:opacity-85"
            >
              {busyGoing === true ? <ActivityIndicator size="small" color={palette.actionForeground} /> : null}
              <Text className="text-action-foreground text-[15px] font-semibold">Going</Text>
            </Pressable>
            <Pressable
              onPress={() => reply(false)}
              onLongPress={onHold}
              delayLongPress={300}
              disabled={answer.isPending}
              accessibilityRole="button"
              accessibilityLabel={`Can't go to ${plan.title}`}
              accessibilityState={{ busy: busyGoing === false, disabled: answer.isPending }}
              className="flex-1 h-11 rounded-[14px] bg-muted flex-row items-center justify-center gap-2 active:opacity-70"
            >
              {busyGoing === false ? <ActivityIndicator size="small" color={palette.foreground} /> : null}
              <Text className="text-foreground text-[15px] font-semibold">{"Can't go"}</Text>
            </Pressable>
          </View>
          <Text className="text-muted-foreground text-[12px] leading-4">Going puts it on your Schedule</Text>
        </View>
      ) : mineAnswer === 'accepted' || mineAnswer === 'declined' ? (
        <View className="mt-2.5 pt-2.5 border-t border-border/40 flex-row items-center gap-2">
          {mineAnswer === 'accepted' ? (
            <CalendarCheckIcon size={16} className="text-success" />
          ) : (
            <CalendarXIcon size={16} className="text-muted-foreground" />
          )}
          <Text className="flex-1 text-foreground text-[14px] font-semibold">
            {mineAnswer === 'accepted' ? "You're going" : "You can't go"}
          </Text>
          {answer.isPending ? (
            <ActivityIndicator size="small" color={palette.primary} />
          ) : (
            <Pressable
              onPress={() => reply(mineAnswer !== 'accepted')}
              onLongPress={onHold}
              delayLongPress={300}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={mineAnswer === 'accepted' ? "Change to can't go" : 'Change to going'}
              className="active:opacity-60"
            >
              <Text className="text-primary text-[13px] font-semibold">Change</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <View className="mt-2.5 pt-2.5 border-t border-border/40 flex-row items-center gap-2">
          {going.length > 0 ? (
            <View className="flex-row">
              {going.slice(0, FACES).map((id, i) => {
                const person = people.byId.get(id);
                return (
                  <View
                    key={id}
                    className="rounded-full border-2 border-card"
                    style={{ marginLeft: i === 0 ? 0 : -6 }}
                  >
                    <ChatAvatar
                      name={person?.name ?? '?'}
                      url={autoLoadMedia ? person?.avatar_url : null}
                      size={24}
                    />
                  </View>
                );
              })}
            </View>
          ) : null}
          <Text className="flex-1 text-secondary-foreground text-[13px] leading-[18px]">
            {tally.going ? <Text className="text-foreground font-bold">{tally.going}</Text> : null}
            {tally.going && tally.rest ? ' · ' : null}
            {tally.rest}
          </Text>
        </View>
      )}
    </CardFrame>
  );
}
