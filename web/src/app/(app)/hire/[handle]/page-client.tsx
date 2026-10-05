'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Clock, CloudOff, Loader2, MapPin, Send, UserSearch } from 'lucide-react';
import { toast } from 'sonner';
import { Screen } from '@/components/app-shell';
import { CenteredSpinner, EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useHireEnquiries, useSendEnquiry } from '@/hooks/useHire';
import { usePublicProfile } from '@/hooks/useProfile';

/**
 * The enquiry form.
 *
 * On the app host rather than beside the public profile on virgo.ph, because
 * sending needs a session — and the AuthGuard on this route group already
 * bounces a signed-out visitor through sign-in and back to this exact URL.
 */
export default function HirePage() {
  const { handle } = useParams<{ handle: string }>();
  const router = useRouter();
  const send = useSendEnquiry();

  // The same query, and so the same cache entry, as the profile this is
  // opened from: arriving here from it costs no second fetch.
  const profile = usePublicProfile(handle);
  const hire = useHireEnquiries();
  // Asking again, after already asking about another job, is your call.
  const [askAgain, setAskAgain] = useState(false);

  const [message, setMessage] = useState('');
  const [roleWanted, setRoleWanted] = useState<string | null>(null);
  const [eventDate, setEventDate] = useState('');
  const [budget, setBudget] = useState('');

  // Waits for the enquiries as well, or the form shows and then swaps for
  // "you've already asked" a moment later. A list that fails to load does not
  // hold the form back: isLoading goes false whether it arrived or not.
  if (profile.isLoading || hire.isLoading) {
    return <Screen title="Hire"><CenteredSpinner /></Screen>;
  }

  // A failed load is not a missing profile: saying "not found" to somebody
  // on a bad connection sends them away from a person who is right there.
  if (!profile.notFound && profile.loadFailed) {
    return (
      <Screen title="Hire">
        <EmptyState
          icon={CloudOff}
          title="Could not load this profile"
          description="Check your connection and try again."
          action={<Button onClick={() => profile.refetch()}>Try again</Button>}
        />
      </Screen>
    );
  }

  if (profile.notFound || !profile.profile) {
    return (
      <Screen title="Hire">
        <EmptyState
          icon={UserSearch}
          title="Profile not found"
          description="This profile is private, or the handle has changed."
          action={<Button onClick={() => router.push('/nearby')}>Find collaborators</Button>}
        />
      </Screen>
    );
  }

  const person = profile.profile;
  const firstName = person.displayName.split(' ')[0];
  const tooShort = message.trim().length < 10;
  /*
   * One you sent that they have not answered.
   *
   * The form never knew, so a second click on Hire — from Nearby, then from
   * their profile — sent the same person the same enquiry twice. Matched by
   * handle, since that is all the address has; the leading @ and the case are
   * how people type it, not part of it.
   */
  const asked = String(handle).replace(/^@/, '').toLowerCase();
  const waiting = hire.sent.find(
    (e) => e.status === 'new' && !!e.personHandle && e.personHandle.toLowerCase() === asked,
  );

  const onSubmit = () => {
    send.mutate(
      {
        handle,
        message: message.trim(),
        roleWanted: roleWanted ?? undefined,
        eventDate: eventDate || undefined,
        budget: budget.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success(`Enquiry sent to ${firstName}`, {
            description: 'You will be connected as soon as they accept.',
          });
          router.push('/network?tab=enquiries');
        },
        onError: (error: Error) => toast.error(error.message),
      },
    );
  };

  return (
    <Screen title={`Hire ${person.displayName ?? ""}`.trim()}>
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
            <div className="flex items-center gap-4">
              <Avatar className="size-14">
                <AvatarImage src={person.avatarUrl ?? undefined} alt="" />
                <AvatarFallback>
                  {person.displayName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-bold">{person.displayName}</h1>
                <p className="truncate text-sm text-muted-foreground">
                  {person.title || person.roles.join(', ')}
                </p>
                {person.location && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3" />
                    {person.location}
                  </p>
                )}
              </div>
              {/* Their profile, so you can look at the work again before
                  writing the brief — in the app, not a new tab. */}
              <Link
                href={`/u/${person.handle}`}
                className="ml-auto hidden shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline sm:flex"
              >
                @{person.handle}
              </Link>
            </div>

            {waiting && !askAgain ? (
              <div className="space-y-4">
                <div className="space-y-2 rounded-xl bg-muted/40 p-4">
                  <p className="flex items-center gap-2 text-[15px] font-bold">
                    <Clock className="size-4 text-primary" />
                    You’ve already asked {firstName}
                  </p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Sent {new Date(waiting.createdAt).toLocaleDateString()}
                    {waiting.roleWanted ? ` for ${waiting.roleWanted}` : ''}. They haven’t
                    answered yet — you’ll hear when they do, and a chat opens if
                    they accept.
                  </p>
                  <p className="line-clamp-4 whitespace-pre-line text-sm leading-relaxed">
                    “{waiting.message}”
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild>
                    <Link href="/network?tab=enquiries">See your enquiries</Link>
                  </Button>
                  <Button variant="ghost" onClick={() => setAskAgain(true)}>
                    Ask about a different job
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {person.roles.length > 0 && (
                  <div>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      What do you need?
                    </Label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {person.roles.map((role) => (
                        <button
                          key={role}
                          type="button"
                          onClick={() =>
                            setRoleWanted((current) => (current === role ? null : role))
                          }
                        >
                          <Badge
                            variant={roleWanted === role ? 'default' : 'outline'}
                            className="cursor-pointer px-3 py-1.5 text-[13px]"
                          >
                            {role}
                          </Badge>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="eventDate">Date of the job</Label>
                    <Input
                      id="eventDate"
                      type="date"
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="budget">Budget (optional)</Label>
                    <Input
                      id="budget"
                      placeholder="₱25,000"
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                      maxLength={60}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="message">The brief</Label>
                  <Textarea
                    id="message"
                    rows={6}
                    maxLength={2000}
                    placeholder={`Hi ${firstName} — tell them what the job is, where it is, and roughly how long you need them for.`}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {message.trim().length < 10
                      ? 'A sentence or two at least — a blank enquiry rarely gets a reply.'
                      : `${message.length} / 2000`}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-4 border-t pt-4">
                  <p className="text-xs text-muted-foreground">
                    Accepting connects you both and opens a chat.
                  </p>
                  <Button onClick={onSubmit} disabled={tooShort || send.isPending}>
                    {send.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    Send enquiry
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </Screen>
  );
}
