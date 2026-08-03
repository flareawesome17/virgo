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
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');

  const min = toCentavos(budgetMin);
  const max = toCentavos(budgetMax);
  const budgetBackwards = min != null && max != null && min > max;

  const ready =
    title.trim().length >= 8 &&
    description.trim().length >= 30 &&
    rolesWanted.length > 0 &&
    !budgetBackwards;

  const submit = () => {
    create.mutate(
      {
        title: title.trim(),
        description: description.trim(),
        rolesWanted,
        eventDate: eventDate || undefined,
        location: location.trim() || undefined,
        budgetMin: min,
        budgetMax: max,
      },
      {
        onSuccess: (job) => {
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
                This goes on the public board at virgo.ph/jobs, so anyone
                looking for this kind of work can find it.
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
                This is the line people scan on the board. Say the role, the
                place and roughly when.
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
                <Input
                  id="eventDate"
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  The post closes itself the day after.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="location">Where</Label>
                <Input
                  id="location"
                  placeholder="Cebu City"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  maxLength={120}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="budgetMin">Budget from (₱)</Label>
                <Input
                  id="budgetMin"
                  inputMode="numeric"
                  placeholder="30,000"
                  value={budgetMin}
                  onChange={(e) => setBudgetMin(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="budgetMax">up to (₱)</Label>
                <Input
                  id="budgetMax"
                  inputMode="numeric"
                  placeholder="45,000"
                  value={budgetMax}
                  onChange={(e) => setBudgetMax(e.target.value)}
                />
              </div>
            </div>
            {budgetBackwards ? (
              <p className="-mt-3 text-xs text-destructive">
                The lower figure needs to be the smaller one.
              </p>
            ) : (
              <p className="-mt-3 text-xs text-muted-foreground">
                Optional, but a post with a number gets far better applications
                than one without.
              </p>
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
                Posts run for 30 days, or until the job date passes.
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
