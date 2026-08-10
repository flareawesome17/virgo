'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useCreateJob } from '@/hooks/useJobs';
import { JOB_TITLE_MIN, jobPostBlockers, joinBlockers } from '@/lib/job-form';
import { DatePickerField } from '@/components/date-picker-field';
import { LocationField } from '@/components/location-field';

/** Local, not UTC — toISOString would rule out today west of Greenwich. */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}
import { useRoles } from '@/hooks/useRoles';

/** Pesos in the form, centavos on the wire. */
function toCentavos(value: string): number | undefined {
  const pesos = Number(value.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(pesos) || pesos <= 0) return undefined;
  return Math.round(pesos * 100);
}

export default function NewJobPage() {
  const router = useRouter();
  const create = useCreateJob();
  const { roles: allRoles } = useRoles();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rolesWanted, setRolesWanted] = useState<string[]>([]);
  const [eventDate, setEventDate] = useState('');
  const [location, setLocation] = useState('');
  /*
   * Kept as typed text per role, converted on submit.
   *
   * Keyed by role rather than held as a list, so deselecting a role and
   * picking it again does not lose what was already typed — and a role that
   * stays deselected is simply never read, since only `rolesWanted` is
   * iterated.
   */
  const [roleBudgets, setRoleBudgets] = useState<
    Record<string, { min: string; max: string }>
  >({});

  const setRoleBudget = (role: string, end: 'min' | 'max', value: string) =>
    setRoleBudgets((current) => ({
      ...current,
      [role]: { ...(current[role] ?? { min: '', max: '' }), [end]: value },
    }));

  const pair = (role: string) => ({
    min: toCentavos(roleBudgets[role]?.min ?? ''),
    max: toCentavos(roleBudgets[role]?.max ?? ''),
  });

  const budgetBackwards = rolesWanted.some((role) => {
    const { min, max } = pair(role);
    return min != null && max != null && min > max;
  });

  const blockers = jobPostBlockers({
    title,
    description,
    rolesWanted,
    budgetBackwards,
  });
  const ready = blockers.length === 0;

  const submit = () => {
    const budgets: Record<string, { min?: number; max?: number }> = {};
    for (const role of rolesWanted) {
      const { min, max } = pair(role);
      if (min == null && max == null) continue;
      budgets[role] = {};
      if (min != null) budgets[role].min = min;
      if (max != null) budgets[role].max = max;
    }

    create.mutate(
      {
        title: title.trim(),
        description: description.trim(),
        rolesWanted,
        roleBudgets: budgets,
        eventDate: eventDate || undefined,
        location: location.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Your job is live', {
            description: 'People who do this work can find it now.',
          });
          router.push('/jobs/mine');
        },
        onError: (error: Error) => toast.error(error.message),
      },
    );
  };

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl px-6 py-6">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mb-4 text-muted-foreground"
          onClick={() => router.back()}
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>

        <Card>
          <CardContent className="space-y-6 pt-6">
            <div>
              <h1 className="text-lg font-bold">Post a job</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {/* Said "the public board at virgo.ph/jobs" while the board
                    answers 401 without a session — promising the open web
                    something only members can see. */}
                Everyone on Virgo sees this on the job board, so anyone looking
                for this kind of work can find it. It is not visible outside
                the app.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="title">What do you need?</Label>
              <Input
                id="title"
                placeholder="Wedding photographer for a December wedding in Cebu"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
              />
              <p className="text-xs text-muted-foreground">
                {title.trim().length > 0 && title.trim().length < JOB_TITLE_MIN
                  ? `A little longer — ${JOB_TITLE_MIN - title.trim().length} more character${
                      JOB_TITLE_MIN - title.trim().length === 1 ? '' : 's'
                    }. Say the role, the place and roughly when.`
                  : 'This is the line people scan on the board. Say the role, the place and roughly when.'}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Which roles are you hiring for?</Label>
              <div className="flex flex-wrap gap-2">
                {allRoles.map((role) => {
                  const on = rolesWanted.includes(role);
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() =>
                        setRolesWanted((current) =>
                          on
                            ? current.filter((r) => r !== role)
                            : [...current, role],
                        )
                      }
                    >
                      <Badge
                        variant={on ? 'default' : 'outline'}
                        className="cursor-pointer px-3 py-1.5 text-[13px]"
                      >
                        {role}
                      </Badge>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Pick more than one if the event needs a team — it will show up
                in each of their searches.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="eventDate">Date of the job</Label>
                <DatePickerField
                  id="eventDate"
                  value={eventDate}
                  onChange={setEventDate}
                  placeholder="Pick a date (optional)"
                  fromDate={todayIso()}
                />
                <p className="text-xs text-muted-foreground">
                  The post closes itself the day after.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="location">Where</Label>
                <LocationField
                  id="location"
                  value={location}
                  onChange={setLocation}
                />
              </div>
            </div>

            {/*
              A budget per role, not one for the post.

              A wedding wanting a photographer, a videographer and an HMUA pays
              three different rates, and a single "₱2,000 – ₱15,000" across all
              three tells a photographer nothing and an HMUA nothing. It also
              decided what an accepted applicant's booking opened at, so an
              HMUA was booked at the videographer's ceiling.

              Only the roles actually selected get a row, so the section grows
              with the post rather than asking for numbers nobody needs.
            */}
            {rolesWanted.length > 0 && (
              <div className="space-y-2">
                <Label>What each role pays (₱)</Label>
                <div className="space-y-2">
                  {rolesWanted.map((role) => (
                    <div
                      key={role}
                      className="grid items-center gap-2 sm:grid-cols-[10rem_1fr_1fr]"
                    >
                      <span className="truncate text-sm font-medium">{role}</span>
                      <Input
                        inputMode="numeric"
                        placeholder="from 30,000"
                        aria-label={`${role} budget from`}
                        value={roleBudgets[role]?.min ?? ''}
                        onChange={(e) => setRoleBudget(role, 'min', e.target.value)}
                      />
                      <Input
                        inputMode="numeric"
                        placeholder="up to 45,000"
                        aria-label={`${role} budget up to`}
                        value={roleBudgets[role]?.max ?? ''}
                        onChange={(e) => setRoleBudget(role, 'max', e.target.value)}
                      />
                    </div>
                  ))}
                </div>
                {budgetBackwards ? (
                  <p className="text-xs text-destructive">
                    The lower figure needs to be the smaller one.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Optional, but a role with a number gets far better
                    applications than one without.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="description">The brief</Label>
              <Textarea
                id="description"
                rows={7}
                maxLength={4000}
                placeholder="What the day looks like, how many hours, what you need delivered and by when. The more specific this is, the fewer wrong applications you get."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {description.trim().length < 30
                  ? 'A few sentences at least — people are deciding whether to spend their day on this.'
                  : `${description.length} / 4000`}
              </p>
            </div>

            <div className="flex items-center justify-between gap-4 border-t pt-4">
              <p className="text-xs text-muted-foreground">
                {ready
                  ? 'Posts run for 30 days, or until the job date passes.'
                  : `Still needs ${joinBlockers(blockers)}.`}
              </p>
              <Button onClick={submit} disabled={!ready || create.isPending}>
                {create.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Post it
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
