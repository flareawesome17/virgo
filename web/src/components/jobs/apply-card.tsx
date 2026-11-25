'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  applicationFor,
  isRoleFilled,
  roleBudgetLabel,
  rolesLeftFor,
  type JobPost,
} from '@/api';
import { useApplyToJob } from '@/hooks/useJobs';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import { firstName } from '@/lib/workspaces';
import { Button } from '@/components/ui/button';
import { CARD, FORM_SUBMIT } from '@/components/kit';
import { APPLICATION_STATE, ApplicationState } from './application-state';

/** "Photographer and HMUA", "a, b and c" — a list a sentence can contain. */
function listOf(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * Applying, beside the post it is for.
 *
 * It was a page of its own, which repeated the title, the date, the place,
 * the pay and the brief above one question: which role. That question sits
 * here now, with the page's one filled button under it.
 *
 * Once you have applied the card says where you stand instead, and your own
 * post gets the way to its applicants. Nothing at all when there is nothing
 * to do: a post that has ended, which the banner over the title already says.
 */
export function ApplyCard({
  post,
  conversationId,
}: {
  post: JobPost;
  /** From the applications list; the post itself does not carry it. */
  conversationId: string | null;
}) {
  const apply = useApplyToJob();
  const [role, setRole] = useState<string | null>(null);
  /** The form again, asked for with "Apply for another". */
  const [another, setAnother] = useState(false);
  const card = useRef<HTMLElement>(null);

  // Old links to the apply page land here with #apply. On a narrow window
  // this card sits under the whole post, so it is brought into view.
  useEffect(() => {
    if (window.location.hash === '#apply') card.current?.scrollIntoView({ block: 'start' });
  }, []);

  const applied = post.myApplications.length > 0;
  // The roles still open to this reader. Applying as HMUA used to close the
  // videographer slot on the same post for good; now it closes only that one.
  const left = rolesLeftFor(post);
  const canApply = !post.isMine && post.status === 'open' && left.length > 0;
  if (!post.isMine && !applied && !canApply) return null;

  // One role left is not a choice, so it is already chosen. More than one and
  // it has to be answered before applying. A role taken since it was picked
  // no longer counts.
  const choosing = left.length > 1;
  const picked = choosing ? (role && left.includes(role) ? role : null) : (left[0] ?? null);
  const showForm = canApply && (!applied || another);

  /*
   * Applying keeps you on the post, which says "Applied as…" on the click:
   * the hook draws the application before the server answers, and takes it
   * back, with the reason, if the server refuses.
   */
  const submit = () => {
    if (!picked) return;
    setAnother(false);
    apply.mutate(
      { slug: post.slug, role: picked },
      {
        onSuccess: () => {
          setRole(null);
          track('job_applied', { rolesOnPost: post.rolesWanted.length, chose: choosing });
          toast.success('Application sent', {
            description: `${post.postedBy.displayName} will see it. A chat opens if they take you on.`,
          });
        },
        onError: (error: Error) => toast.error(error.message),
      },
    );
  };

  return (
    <aside
      ref={card}
      id="apply"
      // scroll-mt clears the shell's bar when #apply scrolls here.
      className={cn(CARD, 'flex min-w-0 flex-[1_1_320px] scroll-mt-28 flex-col gap-3.5 rounded-[20px] p-5')}
    >
      <h2 className="text-base font-bold tracking-tight">
        {post.isMine
          ? 'Your post'
          : !applied
            ? 'Apply'
            : post.myApplications.length === 1
              ? 'Your application'
              : 'Your applications'}
      </h2>

      {post.isMine ? (
        // Your own post offers management, not an application — the API
        // refuses a self-apply, so offering it would only let somebody write
        // out a whole application to be told no.
        <>
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            This is your post. Applications arrive under Jobs › Posted.
          </p>
          {/* To this post's row with its applicants open, not the top of the
              board with every post shut. */}
          <Button asChild variant="secondary" className={FORM_SUBMIT}>
            <Link href={`/jobs?tab=posted&post=${post.id}`}>
              <Users />
              Manage post
            </Link>
          </Button>
        </>
      ) : (
        <>
          {/* What happened to the ones you already made. */}
          {applied && <ApplicationState post={post} conversationId={conversationId} />}

          {/*
            Apply is still offered while any role is left: applying as HMUA
            used to close the videographer slot on the same post for good.
            Behind a quiet button, so the page keeps one filled action and it
            is not pressed at somebody who has already applied.
          */}
          {applied && canApply && !another && (
            <div className="flex flex-col gap-2.5 border-t border-border/40 pt-3.5">
              <p className="text-[13px] leading-[18px] text-muted-foreground">
                You can still apply for {listOf(left)}.
              </p>
              <Button
                variant="secondary"
                className={FORM_SUBMIT}
                disabled={apply.isPending}
                onClick={() => setAnother(true)}
              >
                {apply.isPending && <Loader2 className="size-4 animate-spin" />}
                Apply for another
              </Button>
            </div>
          )}

          {showForm && (
            <div className={cn('flex flex-col gap-3.5', applied && 'border-t border-border/40 pt-3.5')}>
              {/*
                Which role, and what it pays. The rate sits on the option
                because it is the thing being chosen between: applying as an
                HMUA on a post that pays a videographer three times more is a
                decision, not a formality.
              */}
              <fieldset>
                <legend className="pb-2 text-[13px] font-semibold text-muted-foreground">Apply as</legend>
                <div className="flex flex-col gap-2">
                  {post.rolesWanted.map((r) => {
                    // Roles that are gone stay on the list, saying why:
                    // dropping them would leave you wondering whether the
                    // post changed or you misremembered.
                    const mine = applicationFor(post, r);
                    const filled = isRoleFilled(post, r);
                    const open = !mine && !filled;
                    const on = picked === r;
                    return (
                      <label
                        key={r}
                        className={cn(
                          'flex min-h-[52px] items-center gap-3 rounded-xl px-3.5 ring-inset transition-shadow has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
                          on ? 'ring-2 ring-foreground' : 'ring-1 ring-border',
                          open ? 'cursor-pointer' : 'opacity-55',
                        )}
                      >
                        <input
                          type="radio"
                          name="apply-as"
                          value={r}
                          checked={on}
                          disabled={!open}
                          onChange={() => setRole(r)}
                          className="size-[18px] shrink-0 accent-foreground"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{r}</span>
                        <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">
                          {mine
                            ? APPLICATION_STATE[mine.status].label
                            : filled
                              ? 'Filled'
                              : (roleBudgetLabel(post.roleBudgets, r) ?? 'Rate not stated')}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <Button className={FORM_SUBMIT} disabled={!picked || apply.isPending} onClick={submit}>
                {apply.isPending && <Loader2 className="size-4 animate-spin" />}
                {picked ? `Apply as ${picked}` : 'Pick a role to apply'}
              </Button>
              {/*
                No "why you" box. It asked for a paragraph addressed to
                somebody who cannot reply until they have already accepted
                you — and the work says more than the paragraph did.
              */}
              <p className="text-[13px] leading-[18px] text-muted-foreground">
                {firstName(post.postedBy.displayName)} sees your profile, your roles and your portfolio.
              </p>
            </div>
          )}
        </>
      )}
    </aside>
  );
}
