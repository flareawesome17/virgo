'use client';

import { useState } from 'react';
import { CalendarDays, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAnswerDate } from '@/hooks/useChatCards';
import { chatProblem } from '@/components/chat/chat-errors';
import {
  myPlanAnswer,
  planBadge,
  planTally,
  planWhenLine,
  type DatePlanCardContext,
} from '@/api';
import { CardKindLabel, GoneNote, cardShell, firstName, initial, type CardEnv } from '@/components/chat/cards/card-parts';

type PlanNow = NonNullable<DatePlanCardContext['plan']>;

/** How many faces of who is going fit before "+2". */
const FACES = 4;

/** "Ana", "you", or a stand-in for someone who has left the chat. */
function nameOf(id: string, env: CardEnv): string {
  if (id === env.meId) return 'you';
  const person = env.people.get(id);
  return person ? firstName(person.name) : 'Someone';
}

function andList(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Who's coming, in one line (board ChatDateCard): "3 going · Bea can't".
 * Two or fewer can'ts by name, more as a count; who hasn't answered only for
 * the person who planned it, since it is theirs to chase.
 */
export function planTallyLine(plan: PlanNow, env: CardEnv): { going: string; rest: string } {
  const organiser = plan.organiserId === env.meId;
  if (plan.answers.length === 0) {
    return organiser
      ? { going: 'On your Schedule', rest: 'No one here was invited' }
      : { going: `On ${nameOf(plan.organiserId, env)}'s Schedule`, rest: '' };
  }
  const { going, cant: everyoneCant, waiting } = planTally(plan);
  // Your own "can't" is already said as "You can't go"; naming you again in
  // the tally read "You can't go · 1 going · You can't".
  const cant = everyoneCant.filter((id) => id !== env.meId);
  const rest: string[] = [];
  if (cant.length > 0) {
    const names = cant.map((id) => nameOf(id, env));
    const said = cant.length <= 2 ? andList(names) : String(cant.length);
    rest.push(`${said.charAt(0).toUpperCase()}${said.slice(1)} can't`);
  }
  if (organiser && waiting.length > 0) {
    rest.push(`${waiting.length} ${waiting.length === 1 ? "hasn't" : "haven't"} said`);
  }
  return { going: going.length > 0 ? `${going.length} going` : 'No one going yet', rest: rest.join(' · ') };
}

/**
 * A date planned in the chat (boards ChatDateCard, ChatPlanDate): the day,
 * what and where, who is going. Somebody invited answers right on the card,
 * and the answer is the calendar's own — Going puts it on their Schedule and
 * tells whoever planned it. Everyone else sees who is coming.
 */
export function DatePlanCard({
  messageId,
  context,
  env,
}: {
  messageId: string;
  context: DatePlanCardContext | null;
  env: CardEnv;
}) {
  const answer = useAnswerDate(env.conversationId);
  const [changing, setChanging] = useState(false);
  const plan = context?.plan;

  if (!plan) {
    return (
      <div className={cardShell(env.mine, 'flex w-72 flex-col gap-1.5 px-3.5 py-3')}>
        <CardKindLabel icon={CalendarDays}>Date</CardKindLabel>
        <GoneNote>This date was removed.</GoneNote>
      </div>
    );
  }

  const badge = planBadge(plan.date);
  const mineNow = myPlanAnswer(plan, env.meId);
  const asking = mineNow === 'pending' || (mineNow !== null && changing);
  const { going: goingLine, rest } = planTallyLine(plan, env);
  const going = planTally(plan).going;
  const answering = answer.isPending ? answer.variables?.going : undefined;

  const reply = (yes: boolean) =>
    answer.mutate(
      { messageId, going: yes },
      {
        onSuccess: () => setChanging(false),
        onError: (err) => toast.error('Could not answer', { description: chatProblem(err) }),
      },
    );

  return (
    <div className={cardShell(env.mine, 'flex w-72 flex-col gap-2.5 p-3')}>
      <span className="flex items-center gap-3">
        <span
          className={cn(
            'flex h-14 w-[52px] shrink-0 flex-col items-center justify-center rounded-xl',
            env.mine ? 'bg-primary/10' : 'bg-muted',
          )}
          aria-hidden
        >
          <span className={cn('text-[11px] font-bold leading-[14px]', env.mine ? 'text-primary' : 'text-muted-foreground')}>
            {badge?.month}
          </span>
          <span className="text-[22px] font-bold leading-[26px] tabular-nums">{badge?.day}</span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="line-clamp-2 text-sm font-bold leading-5">{plan.title}</span>
          <span className="text-xs leading-[18px] text-muted-foreground">{planWhenLine(plan)}</span>
        </span>
      </span>

      {asking ? (
        <>
          <span className="flex gap-2">
            <button
              type="button"
              disabled={answer.isPending}
              onClick={() => reply(true)}
              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-action text-sm font-semibold text-action-foreground transition-colors hover:bg-action/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {answering === true && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Going
            </button>
            <button
              type="button"
              disabled={answer.isPending}
              onClick={() => reply(false)}
              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-secondary text-sm font-semibold text-secondary-foreground transition-colors hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {answering === false && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Can&apos;t go
            </button>
          </span>
          <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            Going puts it on your Schedule
            {changing && (
              <button
                type="button"
                onClick={() => setChanging(false)}
                className="font-semibold text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Cancel
              </button>
            )}
          </span>
        </>
      ) : (
        <span className="flex items-center gap-2 border-t pt-2.5">
          {going.length > 0 && (
            <span className="flex shrink-0" aria-hidden>
              {going.slice(0, FACES).map((id, i) => (
                <span
                  key={id}
                  className={cn(
                    'grid size-6 place-items-center rounded-full bg-primary/15 text-[11px] font-bold text-primary ring-2 ring-card',
                    i > 0 && '-ml-1.5',
                  )}
                >
                  {initial(env.people.get(id)?.name)}
                </span>
              ))}
              {going.length > FACES && (
                <span className="-ml-1.5 grid size-6 place-items-center rounded-full bg-muted text-[10px] font-bold ring-2 ring-card">
                  +{going.length - FACES}
                </span>
              )}
            </span>
          )}
          <span className="min-w-0 flex-1 text-xs leading-[18px] text-muted-foreground">
            {mineNow === 'accepted' || mineNow === 'declined' ? (
              <span className="font-bold text-foreground">
                {mineNow === 'accepted' ? "You're going" : "You can't go"}
              </span>
            ) : (
              <span className="font-bold text-foreground">{goingLine}</span>
            )}
            {mineNow === 'accepted' || mineNow === 'declined'
              ? ` · ${goingLine}${rest ? ` · ${rest}` : ''}`
              : rest && ` · ${rest}`}
          </span>
          {(mineNow === 'accepted' || mineNow === 'declined') && (
            <button
              type="button"
              onClick={() => setChanging(true)}
              className="shrink-0 rounded text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Change
            </button>
          )}
        </span>
      )}
    </div>
  );
}
