'use client';

import { useState, type ComponentType } from 'react';
import {
  BriefcaseBusiness,
  CalendarPlus,
  FolderPlus,
  HandCoins,
  HardDrive,
  Mail,
  Receipt,
  Users,
} from 'lucide-react';
import { formatMoney, monthOf, monthRange, todayIso, type ScheduleEvent } from '@/api';
import { useAuth } from '@/hooks/useAuth';
import { useCollaboratorInvitations } from '@/hooks/useCollaborators';
import { useHireEnquiries } from '@/hooks/useHire';
import { useUnseenJobs } from '@/hooks/useJobs';
import { useMoneyInsights, useMoneySuggestions, useMoneySummary } from '@/hooks/useMoney';
import { useEventInvitations, useScheduleEventRange } from '@/hooks/useScheduleEvents';
import { useStorageBreakdown } from '@/hooks/useStorageAdmin';
import { useUsage } from '@/hooks/useUsage';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { combineDateAndTime, dateToKey, isEventUpcoming, todayKey } from '@/lib/calendar';

export interface Need {
  key: string;
  icon: ComponentType<{ className?: string }>;
  text: string;
  /** Where the row goes, in a word or two. */
  where: string;
  href: string;
  urgent?: boolean;
}

export interface MoneyMonth {
  month: string;
  incomeMinor: number;
  expenseMinor: number;
}

/** The last `n` months up to this one, oldest first, as "2026-10" keys. */
function lastMonths(n: number, now = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}

/** "in 40 min", "in 14 h" — only inside the next day, and only with a time. */
export function startsIn(event: ScheduleEvent, now = new Date()): string | null {
  if (!event.event_time) return null;
  const minutes = Math.round(
    (combineDateAndTime(event.event_date, event.event_time).getTime() - now.getTime()) / 60000,
  );
  if (minutes <= 0 || minutes >= 24 * 60) return null;
  if (minutes < 60) return `in ${minutes} min`;
  return `in ${Math.round(minutes / 60)} h`;
}

function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Everything Home shows, gathered once: the web page and the desktop page lay
 * the same day out differently, and must not disagree about what is in it.
 *
 * The same questions the phone's Home asks, in the same order of urgency:
 * what is next, what is waiting on you, what follows, how the month and the
 * storage stand, and the work touched last.
 */
export function useHome() {
  const { profile, user } = useAuth();
  const now = new Date();
  const name = profile?.displayName?.trim().split(/\s+/)[0] || user?.email?.split('@')[0] || '';

  // The next 60 days, by date: the 100 earliest events would be the past.
  const [soonWindow] = useState(() => {
    const end = new Date();
    end.setDate(end.getDate() + 60);
    return { from: todayKey(), to: dateToKey(end) };
  });
  const schedule = useScheduleEventRange(soonWindow.from, soonWindow.to);
  const upcoming = schedule.events
    .filter((e) => isEventUpcoming(e.event_date, e.event_time, now))
    .sort((a, b) =>
      `${a.event_date}${a.event_time ?? ''}`.localeCompare(`${b.event_date}${b.event_time ?? ''}`),
    )
    .slice(0, 5);

  const work = useWorkspaces({ orderBy: 'updated_at', direction: 'desc', limit: 6 });
  const workspaceNameById = Object.fromEntries(work.workspaces.map((w) => [w.id, w.name]));

  const { usage, storageLimitBytes, storageFraction } = useUsage();
  const { breakdown } = useStorageBreakdown();

  // The last six months, which reach back into last year until June: the
  // insights come a calendar year at a time, so then it takes two.
  const [lastSix] = useState(() => lastMonths(6));
  const thisYear = Number(lastSix[lastSix.length - 1].slice(0, 4));
  const spansYears = Number(lastSix[0].slice(0, 4)) !== thisYear;
  const thisYearMoney = useMoneyInsights(thisYear);
  const lastYearMoney = useMoneyInsights(thisYear - 1, { enabled: spansYears });
  const moneyMonths: MoneyMonth[] | null =
    thisYearMoney.insights && (!spansYears || lastYearMoney.insights)
      ? lastSix.map(
          (key) =>
            [...(lastYearMoney.insights?.months ?? []), ...thisYearMoney.insights!.months].find(
              (m) => m.month === key,
            ) ?? { month: key, incomeMinor: 0, expenseMinor: 0 },
        )
      : null;

  // What is waiting on you, the people waiting first.
  const { count: newJobs, applications } = useUnseenJobs();
  const { pending: enquiries } = useHireEnquiries();
  const { invitations: workspaceInvites } = useCollaboratorInvitations();
  const { invitations: eventInvites } = useEventInvitations();
  const moneyRange = monthRange(monthOf(todayIso()));
  const { summary: money } = useMoneySummary(moneyRange.from, moneyRange.to);
  const { suggestions } = useMoneySuggestions();

  const needs: Need[] = [];
  const count = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);
  if (applications > 0) {
    needs.push({
      key: 'applicants',
      icon: Users,
      text: `${count(applications, 'applicant', 'applicants')} waiting on you`,
      where: 'Jobs you posted',
      href: '/jobs?tab=posted',
    });
  }
  if (enquiries.length > 0) {
    needs.push({
      key: 'enquiries',
      icon: Mail,
      text: `${count(enquiries.length, 'hire enquiry', 'hire enquiries')} to answer`,
      where: 'People',
      href: '/people?tab=enquiries',
    });
  }
  if (money && money.owedToYouMinor > 0) {
    needs.push({
      key: 'owed',
      icon: HandCoins,
      text: `${formatMoney(money.owedToYouMinor)} still owed to you`,
      where: 'Money',
      href: '/money',
    });
  }
  if (eventInvites.length > 0) {
    needs.push({
      key: 'event-invites',
      icon: CalendarPlus,
      text: count(eventInvites.length, 'invitation to a shoot', 'invitations to shoots'),
      where: 'Schedule',
      href: '/schedule',
    });
  }
  if (workspaceInvites.length > 0) {
    needs.push({
      key: 'workspace-invites',
      icon: FolderPlus,
      text: count(workspaceInvites.length, 'invitation to a workspace', 'invitations to workspaces'),
      where: 'Workspaces',
      href: '/workspaces',
    });
  }
  // Only with a ceiling: an unlimited plan has nothing to fill.
  if (storageLimitBytes && storageFraction >= 0.9) {
    needs.push({
      key: 'storage',
      icon: HardDrive,
      text: `Storage ${Math.round(storageFraction * 100)}% full`,
      where: 'Storage',
      href: '/settings/storage',
      urgent: true,
    });
  }
  if (newJobs > 0) {
    needs.push({
      key: 'jobs',
      icon: BriefcaseBusiness,
      text: `${count(newJobs, 'new job', 'new jobs')} posted`,
      where: 'Jobs',
      href: '/jobs',
    });
  }
  if (suggestions.length > 0) {
    needs.push({
      key: 'unrecorded',
      icon: Receipt,
      text: `${count(suggestions.length, 'booking', 'bookings')} to record in Money`,
      where: 'Money',
      href: '/money',
    });
  }

  return {
    greeting: name ? `${greeting(now)}, ${name}` : greeting(now),
    dateLine: `${now.toLocaleDateString('en-US', { weekday: 'long' })}, ${now.getDate()} ${now.toLocaleDateString('en-US', { month: 'long' })}`,
    nextEvent: upcoming[0] ?? null,
    laterEvents: upcoming.slice(1, 4),
    scheduleLoading: schedule.isLoading,
    scheduleFailed: schedule.loadFailed && schedule.events.length === 0,
    retrySchedule: () => void schedule.refetch(),
    workspaceNameById,
    needs,
    moneyMonths,
    moneyFailed: thisYearMoney.loadFailed,
    retryMoney: () => void thisYearMoney.refetch(),
    usage,
    byKind: breakdown.byType,
    workspaces: work.workspaces,
    workspacesLoading: work.isLoading,
    workspacesFailed: work.loadFailed && work.workspaces.length === 0,
    retryWorkspaces: () => void work.refetch(),
  };
}

export type HomeData = ReturnType<typeof useHome>;
