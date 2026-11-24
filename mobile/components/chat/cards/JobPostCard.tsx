import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { BriefcaseIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { budgetRangeLabel, planDayLabel, type JobPostCardContext } from '@/src/api';
import { CardButton, CardFrame, CardGone, CardKindLabel, holdActions } from './CardFrame';
import type { CardProps } from './types';

cssInterop(BriefcaseIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/** The word for a post that is no longer taking applications. */
const STATUS_WORD: Record<string, string> = {
  filled: 'Filled',
  closed: 'Closed',
  expired: 'Expired',
};

/**
 * A job post shared in the chat, on its sender's side: what, when, where,
 * which roles and the budget, and whether it is still open.
 */
export function JobPostCard({ message, mine, senderName, meta, cardRef, onHold, pills }: CardProps) {
  const job = ((message.context ?? null) as JobPostCardContext | null)?.job;

  if (!job) {
    const words = "This job post isn't available any more.";
    return (
      <CardFrame ref={cardRef} mine={mine} senderName={senderName} meta={meta} onHold={onHold} pills={pills}>
        <View accessible accessibilityLabel={`Job post. ${words} ${meta}`} {...holdActions(onHold)} className="gap-1.5">
          <CardKindLabel icon={BriefcaseIcon} label="Job post" />
          <CardGone words={words} />
        </View>
      </CardFrame>
    );
  }

  const status = job.status !== 'open' ? (STATUS_WORD[job.status] ?? null) : null;
  const details = [planDayLabel(job.eventDate), job.location, job.roles.join(', ') || null]
    .filter(Boolean)
    .join(' · ');
  const budget = budgetRangeLabel(job.budgetMin, job.budgetMax);

  return (
    <CardFrame ref={cardRef} mine={mine} senderName={senderName} meta={meta} onHold={onHold} pills={pills}>
      <View
        accessible
        accessibilityLabel={['Job post', job.title, status, details || null, budget, meta].filter(Boolean).join('. ')}
        {...holdActions(onHold)}
        className="gap-1.5"
      >
        <CardKindLabel
          icon={BriefcaseIcon}
          label="Job post"
          right={
            status ? (
              <View className="rounded-full bg-muted px-2 py-px">
                <Text className="text-muted-foreground text-[11px] font-bold">{status}</Text>
              </View>
            ) : null
          }
        />
        <Text className="text-foreground text-[16px] leading-[22px] font-bold" numberOfLines={2}>
          {job.title}
        </Text>
        {details ? (
          <Text className="text-secondary-foreground text-[13px] leading-[18px]" numberOfLines={2}>
            {details}
          </Text>
        ) : null}
        {budget ? <Text className="text-foreground text-[15px] leading-5 font-bold">{budget}</Text> : null}
      </View>
      <CardButton
        label="View job"
        onPress={() => router.push(`/jobs/${encodeURIComponent(job.slug)}`)}
        onHold={onHold}
      />
    </CardFrame>
  );
}
