import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { BriefcaseIcon, CheckIcon, ChevronRightIcon, ClockIcon, MapPinIcon, XIcon, type LucideIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { budgetLabel, distanceLabel, isRoleFilled, type JobPost, type MyApplication } from '@/src/api';
import { postedAgo } from '@/src/lib/jobs-format';
import { PLACEHOLDER_IMAGE } from '@/src/lib/placeholder';
import { DateTile } from '@/components/DateTile';
import { PressableScale } from '@/components/PressableScale';
import { RemoteImage } from '@/components/RemoteImage';
import { PALETTES } from '@/theme';

for (const Icon of [BriefcaseIcon, CheckIcon, ChevronRightIcon, ClockIcon, MapPinIcon, XIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * "NOV" and 26 from a job's date. Read off the string, not through Date: a
 * date-only value parses as UTC midnight, which is the day before anywhere
 * west of Greenwich.
 */
export function jobDay(eventDate: string): { month: string; day: number } | null {
  const [, month, day] = eventDate.slice(0, 10).split('-').map(Number);
  if (!month || !day) return null;
  return { month: MONTHS[month - 1] ?? '', day };
}

/**
 * How soon a job is: "Today", "In 3 days", "in 11 days". `soon` is three days
 * or fewer, which is when it stops being something to think about. Null for a
 * day that has passed.
 */
export function jobCountdown(eventDate: string, now: Date = new Date()): { text: string; soon: boolean } | null {
  const [y, m, d] = eventDate.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86_400_000);
  if (days < 0) return null;
  if (days === 0) return { text: 'Today', soon: true };
  if (days === 1) return { text: 'Tomorrow', soon: true };
  return days <= 3 ? { text: `In ${days} days`, soon: true } : { text: `in ${days} days`, soon: false };
}

/** Posted today or yesterday: what the dot on a card means. */
export function isFreshJob(job: Pick<JobPost, 'createdAt'>): boolean {
  return Date.now() - new Date(job.createdAt).getTime() < 2 * 86_400_000;
}

/** Where you stand on a post: the furthest along of your applications. */
const STANDING: MyApplication['status'][] = ['accepted', 'shortlisted', 'new', 'declined'];
export function myStanding(job: JobPost): MyApplication | null {
  const mine = job.myApplications ?? [];
  for (const status of STANDING) {
    const hit = mine.find((application) => application.status === status);
    if (hit) return hit;
  }
  return null;
}

export function jobPlace(job: JobPost): string {
  const distance = distanceLabel(job.distanceKm, job.location);
  // Past 50 km the label is "near <the place>", which beside the place itself
  // says it twice.
  return [job.location, distance && job.location && distance.startsWith('near ') ? null : distance]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The card's last line when it is about you: you applied, you got it, or the
 * post is yours. A tinted strip across the foot, so it reads as the state of
 * the whole card and does not compete with the pay.
 */
function Strip({
  icon: Icon,
  text,
  detail,
  tone = 'plain',
  onPress,
}: {
  icon: LucideIcon;
  text: string;
  detail: string;
  tone?: 'plain' | 'good' | 'quiet';
  onPress?: () => void;
}) {
  const colour = tone === 'good' ? 'text-success' : tone === 'quiet' ? 'text-muted-foreground' : 'text-foreground';
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`${text}, ${detail}`}
      className={`min-h-[44px] flex-row items-center gap-2 px-4 py-3 ${tone === 'good' ? 'bg-success/10' : 'bg-muted'} ${
        onPress ? 'active:opacity-70' : ''
      }`}
    >
      <Icon size={16} className={colour} strokeWidth={2.4} />
      <Text className="flex-1 text-[13px] leading-[18px] text-muted-foreground" numberOfLines={1}>
        <Text className={`font-semibold ${colour}`}>{text}</Text> · {detail}
      </Text>
      {onPress ? <ChevronRightIcon size={16} className="text-muted-foreground" /> : null}
    </Pressable>
  );
}

/**
 * One job on the board, read top to bottom the way somebody decides: when and
 * what, where, what it pays and how soon, who it wants, who is asking.
 *
 * The brief is not on the card. Two lines of it said little, and it is the
 * first thing on the job's own screen; without it four jobs fit where three
 * did, and the pay is the loudest thing on each.
 */
export const JobCard = memo(function JobCard({ job }: { job: JobPost }) {
  const budget = budgetLabel(job.budgetMin, job.budgetMax);
  const when = job.eventDate ? jobDay(job.eventDate) : null;
  const countdown = job.eventDate ? jobCountdown(job.eventDate) : null;
  const where = jobPlace(job);
  const mine = myStanding(job);
  const fresh = isFreshJob(job) && !job.isMine && !mine;
  const open = () => router.push(`/jobs/${job.slug}`);

  const strip = job.isMine ? (
    <Strip
      icon={BriefcaseIcon}
      text="Your post"
      detail={
        job.newApplicantCount > 0
          ? `${job.newApplicantCount} new ${job.newApplicantCount === 1 ? 'applicant' : 'applicants'}`
          : job.applicantCount > 0
            ? `${job.applicantCount} applied`
            : 'nobody has applied yet'
      }
      onPress={() => router.push(`/jobs?tab=posted&post=${job.id}`)}
    />
  ) : mine?.status === 'accepted' ? (
    <Strip icon={CheckIcon} text="You got it" detail="open the booking" tone="good" onPress={() => router.push('/jobs?tab=bookings')} />
  ) : mine?.status === 'shortlisted' ? (
    <Strip icon={CheckIcon} text="You are shortlisted" detail="they are still deciding" />
  ) : mine?.status === 'new' ? (
    <Strip icon={ClockIcon} text="You applied" detail={`${postedAgo(mine.createdAt)}, waiting to hear back`} />
  ) : mine?.status === 'declined' ? (
    <Strip icon={XIcon} text="Not selected" detail="they chose somebody else" tone="quiet" />
  ) : null;

  return (
    <PressableScale
      className="bg-card rounded-[20px] border border-border/40 overflow-hidden"
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={[job.title, where, budget, countdown?.text].filter(Boolean).join(', ')}
      scaleTo={0.98}
    >
      <View className="p-4 gap-3">
        <View className="flex-row items-start gap-3">
          {/* With no date set, the person who posted it stands in. */}
          {when ? (
            <DateTile small={when.month} large={when.day} />
          ) : (
            <RemoteImage
              source={{ uri: job.postedBy.avatarUrl ?? PLACEHOLDER_IMAGE }}
              style={{ width: 44, height: 44, borderRadius: 22 }}
            />
          )}
          <View className="flex-1 min-w-0">
            <Text className="text-foreground text-[16px] leading-[22px] font-semibold" numberOfLines={2}>
              {job.title}
            </Text>
            {where ? (
              <View className="flex-row items-center gap-1 mt-0.5">
                <MapPinIcon size={13} className="text-muted-foreground" />
                <Text className="flex-1 text-muted-foreground text-[13px] leading-[18px]" numberOfLines={1}>
                  {where}
                </Text>
              </View>
            ) : null}
          </View>
          {fresh ? (
            <View className="w-2 h-2 rounded-full bg-action mt-[7px]" accessibilityLabel="New" />
          ) : null}
        </View>

        <View className="flex-row items-baseline justify-between gap-3">
          <Text
            className={`flex-1 text-[20px] leading-[26px] font-bold tracking-tight ${budget ? 'text-foreground' : 'text-muted-foreground'}`}
            style={{ fontVariant: ['tabular-nums'] }}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {budget ?? 'Pay not stated'}
          </Text>
          <Text
            className={`text-[13px] leading-[18px] ${countdown?.soon ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}
          >
            {countdown ? countdown.text : job.eventDate ? '' : 'No date set'}
          </Text>
        </View>

        {/* A filled role stays on the card, struck through, rather than
            disappearing: a post that wanted three people and has two left is
            a different thing from one that only ever wanted one. */}
        <View className="flex-row flex-wrap gap-2">
          {job.rolesWanted.map((role) => {
            const filled = isRoleFilled(job, role);
            return (
              <View key={role} className="rounded-full px-2.5 py-1 bg-muted">
                <Text
                  className={`text-[13px] leading-[18px] font-medium ${
                    filled ? 'text-muted-foreground line-through' : 'text-secondary-foreground'
                  }`}
                  accessibilityLabel={filled ? `${role}, filled` : role}
                >
                  {role}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {strip ?? (
        <View className="flex-row items-center gap-2 px-4 py-3 border-t border-border/30">
          <RemoteImage
            source={{ uri: job.postedBy.avatarUrl ?? PLACEHOLDER_IMAGE }}
            style={{ width: 24, height: 24, borderRadius: 12 }}
          />
          <Text className="flex-1 text-muted-foreground text-[13px] leading-[18px]" numberOfLines={1}>
            <Text className="text-secondary-foreground font-semibold">{job.postedBy.displayName}</Text> ·{' '}
            {postedAgo(job.createdAt)}
          </Text>
          {job.applicantCount > 0 ? (
            <Text className="text-muted-foreground text-[13px] leading-[18px]">{job.applicantCount} applied</Text>
          ) : null}
        </View>
      )}
    </PressableScale>
  );
});

/**
 * The one dark card: the open post that fits you best of those on the screen.
 *
 * Picked here, from what the board already loaded, so it costs no request and
 * can only ever name a job that is also in the list's results.
 */
export function BestJobCard({ job, reason }: { job: JobPost; reason: string }) {
  const palette = PALETTES.light;
  const budget = budgetLabel(job.budgetMin, job.budgetMax);
  const when = job.eventDate ? jobDay(job.eventDate) : null;
  const countdown = job.eventDate ? jobCountdown(job.eventDate) : null;
  const line = [jobPlace(job), countdown?.text.toLowerCase()].filter(Boolean).join(' · ');
  const open = () => router.push(`/jobs/${job.slug}`);
  return (
    <PressableScale
      onPress={open}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${reason}. ${[job.title, line, budget].filter(Boolean).join(', ')}`}
      className="rounded-[20px] bg-foreground p-4 gap-3.5"
    >
      <Text className="text-background/70 text-[13px] leading-[18px] font-semibold">{reason}</Text>
      <View className="flex-row items-start gap-3">
        {when ? (
          <View className="w-11 h-11 rounded-xl bg-background/10 items-center justify-center">
            <Text allowFontScaling={false} className="text-background/70 text-[10px] leading-[12px] font-bold tracking-wider">
              {when.month}
            </Text>
            <Text
              allowFontScaling={false}
              className="text-background text-[17px] leading-5 font-bold"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {when.day}
            </Text>
          </View>
        ) : null}
        <View className="flex-1 min-w-0">
          <Text className="text-background text-[16px] leading-[22px] font-semibold" numberOfLines={2}>
            {job.title}
          </Text>
          {line ? (
            <Text className="text-background/70 text-[13px] leading-[18px] mt-0.5" numberOfLines={1}>
              {line}
            </Text>
          ) : null}
        </View>
      </View>
      <View className="flex-row items-center justify-between gap-3">
        <Text
          className="flex-1 text-background text-[20px] leading-[26px] font-bold tracking-tight"
          style={{ fontVariant: ['tabular-nums'] }}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {budget ?? 'Pay not stated'}
        </Text>
        {/* Drawn as the button, pressed as the card: the whole card opens the
            job, and a button inside a button is one too many for a reader. */}
        <View className="h-11 px-[18px] rounded-[14px] bg-action items-center justify-center" accessibilityElementsHidden importantForAccessibility="no">
          <Text style={{ color: palette.actionForeground }} className="text-[15px] font-semibold">
            View job
          </Text>
        </View>
      </View>
    </PressableScale>
  );
}
