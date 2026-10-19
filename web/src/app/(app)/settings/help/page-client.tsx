'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ChevronRight, Copy, LifeBuoy, Search, SearchX, X } from 'lucide-react';
import { toast } from 'sonner';
import { API_BASE_URL } from '@/api';
import { PageHeader, Screen } from '@/components/app-shell';
import { SettingRow } from '@/components/settings/setting-row';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { useUsage } from '@/hooks/useUsage';
import { useServerVersion } from '@/hooks/useVersion';
import { notificationPermission } from '@/lib/alerts';
import { cn } from '@/lib/utils';
import { APP_COMMIT, RELEASE_LABEL } from '@/lib/version';

/** Set only when this client was staged for the desktop app. */
const IS_DESKTOP = process.env.NEXT_PUBLIC_VIRGO_DESKTOP === '1';

interface Article {
  q: string;
  a: string;
  /** Where in the app the answer lives, when there is somewhere to go. */
  route?: string;
  routeLabel?: string;
}

/**
 * Answers to what this app actually does.
 *
 * The phone's help centre (mobile/app/(app)/settings/help.tsx), rewritten
 * wherever its answer was the phone's: there is no pull to refresh, no gallery
 * and no Network tab here, and "where is it?" has a different answer in a
 * sidebar than in a tab bar. Every claim is something the web app does today,
 * and the desktop app runs these same pages, so one set of answers serves both.
 */
const SECTIONS: { title: string; articles: Article[] }[] = [
  {
    title: 'Finding your way',
    articles: [
      {
        q: 'Where do I start something new?',
        a: 'From Create in the top bar, or press C anywhere you are not typing. It starts a showcase, a job, a workspace, an album, an event or a reminder.',
      },
      {
        q: 'Where are my jobs and bookings?',
        a: 'In Jobs. Browse is every open job, Posted is the jobs you posted with the people who applied, Applied is the jobs you applied to, and Bookings is the work that was agreed.',
        route: '/jobs',
        routeLabel: 'Open Jobs',
      },
      {
        q: 'Where do I find people?',
        a: 'In People. People holds your connections and requests, Enquiries the people asking to hire you, and Nearby who is close by, once you share your location.',
        route: '/people',
        routeLabel: 'Open People',
      },
      {
        q: 'How do I change my profile?',
        a: 'Settings, then Profile, or Edit profile under your picture at the end of the top bar. Your profile, in the same menu, shows your page the way other people see it.',
        route: '/settings/profile',
        routeLabel: 'Edit profile',
      },
      {
        q: 'Is the desktop app any different?',
        a: 'It runs the same pages as the web app in a window of its own, so every answer here holds there too. It also keeps what you have opened on your computer, so your workspaces, albums and schedule stay on screen without a connection, but changes need one to save. When the app has an update, it downloads inside the app and asks before restarting.',
      },
    ],
  },
  {
    title: 'Uploading',
    articles: [
      {
        q: 'Where do my uploads go?',
        a: 'Into the album you upload them from. Open an album and choose Upload, for files or a whole folder, or drag files and folders straight onto the page. Uploads carry on while you move around Virgo, and closing the tab asks first. Everything is stored in the cloud and counts towards your storage.',
        route: '/albums',
        routeLabel: 'Open Albums',
      },
      {
        q: 'I uploaded but the album looks empty',
        a: 'Reload the page. If your storage went up but nothing appears, the files landed without an album: Settings, Storage lists them under Unassigned files, where you can file them into one.',
        route: '/settings/storage',
        routeLabel: 'Open Storage',
      },
      {
        q: 'Which file types work?',
        a: 'JPEG, PNG, HEIC, WebP, AVIF, GIF and TIFF for photos; MP4, MOV and WebM for video; MP3, M4A, WAV, AAC, FLAC and OGG for audio, up to 500 MB each. Anything else in a dropped folder is left out, and you are told how many.',
      },
    ],
  },
  {
    title: 'Sharing with clients',
    articles: [
      {
        q: 'How do I send an album to a client?',
        a: 'Open the album and choose Client link. Tick what the link shows (photos, videos, audio), then Generate link and copy it. It opens in any browser with no account needed.',
      },
      {
        q: 'Can I take a link back?',
        a: 'Yes. Choose Client link on the album again, then Revoke link. Anyone opening the old link then sees a page saying it is no longer available, and a new link has a different address.',
      },
      {
        q: 'Is a client link private?',
        a: 'It is unguessable, but it is public to anyone who has it. Treat it like a key: fine to send to a client, not something to post. Revoke it once a shoot is signed off.',
      },
    ],
  },
  {
    title: 'Collaborators and chat',
    articles: [
      {
        q: 'Why can I only invite friends?',
        a: 'Collaborating means access to your work, so both sides agree first. Find the person in People and choose Connect. Once they accept, open your workspace and choose Invite. Nothing is shared until they accept that too.',
        route: '/people',
        routeLabel: 'Open People',
      },
      {
        q: 'What does a collaborator see?',
        a: 'The albums you chose when you invited them, at the level you chose for each: View, Download, Upload or Manage. Albums you add later reach them only if you said so. Change any of it from the Members tab of the workspace.',
        route: '/workspaces',
        routeLabel: 'Open Workspaces',
      },
      {
        q: 'Who can I chat with?',
        a: 'Anyone you are connected with, one to one or in a group. Accepting a job application or a hire enquiry connects you too. Group members can add their own connections, and anyone can leave a group without ending it for everyone else. Messages are text only: to send a client your work, share a client link.',
        route: '/chat',
        routeLabel: 'Open Messages',
      },
      {
        q: 'What do the ticks on my messages mean?',
        a: 'A clock means it is still sending, or waiting for a connection. One tick means the server has it. Two faint ticks mean it reached them, and two solid ticks mean they have read it; in a group, the ticks wait for everyone. Not sent, with a red mark, means it never went: choose Retry, or Discard it.',
      },
    ],
  },
  {
    title: 'Schedule and reminders',
    articles: [
      {
        q: 'How do reminders reach me?',
        a: 'When one comes due, the server sends it wherever you are signed in: under the bell, as a desktop alert if Virgo is open in the background and alerts are allowed, and on your phone if you have the Virgo app. If Virgo is closed on this computer, it waits under the bell. Once the phone app has the reminder, it also sets the alarm on the phone itself, so it rings there even without a connection.',
        route: '/settings/notifications',
        routeLabel: 'Choose what reaches you',
      },
      {
        q: 'My past events disappeared',
        a: 'Events are cleaned up automatically once they have been over for a while. Upcoming only lists events that have not started yet; pick a day on the calendar to see earlier ones.',
        route: '/schedule',
        routeLabel: 'Open Schedule',
      },
    ],
  },
  {
    title: 'Storage',
    articles: [
      {
        q: 'What counts towards my storage?',
        a: 'Every photo, video and audio file you have uploaded, across all your workspaces. The figure comes from what is actually stored, not from anything measured on your computer.',
        route: '/settings/storage',
        routeLabel: 'Open Storage',
      },
      {
        q: 'I hit my album or workspace limit',
        a: 'Album limits are counted per workspace, not in total. The free plan includes 3 workspaces with up to 10 albums in each, and 15 GB of storage. Archived workspaces still count; deleting a workspace or album you have finished with makes room.',
        route: '/settings/storage',
        routeLabel: 'Open Storage',
      },
      {
        q: 'How do I delete everything I have uploaded?',
        a: 'Settings, Storage, then Wipe cloud data at the bottom. It asks you to type DELETE first, because it cannot be undone. Your albums and workspaces stay, empty.',
        route: '/settings/storage',
        routeLabel: 'Open Storage',
      },
    ],
  },
];

/**
 * Every word of the search, anywhere in the question or its answer.
 *
 * Words rather than the phrase as typed: "revoke link" and "link revoke" should
 * both find "Can I take a link back?", whose answer says Revoke link, and a
 * whole-phrase match finds the first only.
 */
function matches(article: Article, words: string[]): boolean {
  const text = `${article.q} ${article.a}`.toLowerCase();
  return words.every((word) => text.includes(word));
}

/** A stable id for an answer, for the question's aria-controls. */
function answerId(q: string): string {
  return `help-${q.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

/**
 * Help.
 *
 * Searchable rather than a long scroll, as on the phone: people arrive here
 * with a specific question, and the answer they need is usually two sections
 * down.
 */
export default function HelpPage() {
  const { profile } = useAuth();
  const { usage } = useUsage();
  const server = useServerVersion();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const sections = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return SECTIONS;
    return SECTIONS.map((section) => ({
      ...section,
      articles: section.articles.filter((article) => matches(article, words)),
    })).filter((section) => section.articles.length > 0);
  }, [search]);

  /** What support needs to reproduce a problem, and nothing more. */
  const copyDetails = async () => {
    // Put together in the click, not during render: the server render has no
    // navigator, and reading one there would disagree with the hydrating render.
    const details = [
      `Release: ${RELEASE_LABEL ?? 'local build'}`,
      `Commit: ${APP_COMMIT ?? 'unknown'}`,
      `App: ${IS_DESKTOP ? 'desktop' : 'web'}`,
      `Server: ${server.data ? (server.version ?? 'local build') : 'unknown'}`,
      `Browser: ${navigator.userAgent}`,
      `Plan: ${usage?.plan ?? 'unknown'}`,
      `Account: ${profile?.email ?? 'unknown'}`,
      `API: ${API_BASE_URL || 'not configured'}`,
      `Desktop notifications: ${notificationPermission()}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(details);
      toast.success('Copied', { description: 'Paste them into your support request.' });
    } catch {
      toast.error('Could not copy', { description: 'This browser did not allow it.' });
    }
  };

  return (
    <Screen title="Help">
      <PageHeader title="Help" description="How Virgo works, and how to reach us" />

      <div className="w-full max-w-3xl">
        <div role="search" className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search help"
            aria-label="Search help"
            autoComplete="off"
            className="h-10 pl-9 pr-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {sections.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed">
            <EmptyState
              icon={SearchX}
              title="Nothing found"
              description="Try a different word, or ask Support and we will answer you directly."
              action={
                <Button asChild size="sm">
                  <Link href="/support">
                    <LifeBuoy className="size-4" />
                    Ask Support
                  </Link>
                </Button>
              }
            />
          </div>
        ) : (
          sections.map((section) => (
            <section key={section.title}>
              <h2 className="mb-2 mt-8 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {section.title}
              </h2>
              <Card className="py-0">
                <CardContent className="p-0">
                  <ul className="divide-y">
                    {section.articles.map((article) => {
                      const expanded = open === article.q;
                      const id = answerId(article.q);
                      return (
                        <li key={article.q}>
                          <button
                            type="button"
                            aria-expanded={expanded}
                            aria-controls={id}
                            onClick={() => setOpen(expanded ? null : article.q)}
                            className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-sm font-semibold transition-colors hover:bg-accent/50"
                          >
                            <span className="min-w-0 flex-1">{article.q}</span>
                            <ChevronRight
                              className={cn(
                                'size-4 shrink-0 text-muted-foreground transition-transform',
                                expanded && 'rotate-90',
                              )}
                            />
                          </button>
                          {/* Always in the page, hidden when shut, so the
                              question's aria-controls points at something. */}
                          <div id={id} hidden={!expanded} className="px-5 pb-4">
                            <p className="max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
                              {article.a}
                            </p>
                            {article.route && (
                              <Button asChild size="sm" variant="secondary" className="mt-3">
                                <Link href={article.route}>
                                  {article.routeLabel ?? 'Open'}
                                  <ChevronRight className="size-3.5" />
                                </Link>
                              </Button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            </section>
          ))
        )}

        {/* Support is a conversation in the app here, not the phone's email:
            the reply arrives under the bell and on the request itself. */}
        <h2 className="mb-2 mt-8 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Still stuck
        </h2>
        <Card className="py-0">
          <CardContent className="p-0">
            <SettingRow
              icon={LifeBuoy}
              title="Ask Support"
              detail="Ask us anything. We answer in the app and by email."
            >
              <Button asChild size="sm" variant="outline">
                <Link href="/support">
                  Open
                  <ChevronRight className="size-4" />
                </Link>
              </Button>
            </SettingRow>
            <SettingRow
              icon={Copy}
              title="Copy details for support"
              detail={`${RELEASE_LABEL ?? 'Local build'} · ${IS_DESKTOP ? 'desktop app' : 'web app'}. Paste them into your request.`}
            >
              <Button size="sm" variant="outline" onClick={() => void copyDetails()}>
                Copy
              </Button>
            </SettingRow>
          </CardContent>
        </Card>
      </div>
    </Screen>
  );
}
