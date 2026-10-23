'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import {
  ChevronRight,
  ExternalLink,
  FileText,
  Globe,
  LifeBuoy,
  Loader2,
  Monitor,
  Server,
  UserRound,
} from 'lucide-react';
import { PageHeader, Screen } from '@/components/app-shell';
import { SettingRow } from '@/components/settings/setting-row';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useServerVersion } from '@/hooks/useVersion';
import { APP_COMMIT, RELEASE_LABEL } from '@/lib/version';

/** Set only when this client was staged for the desktop app. */
const IS_DESKTOP = process.env.NEXT_PUBLIC_VIRGO_DESKTOP === '1';

/** A version number at the end of a row. */
function Value({ children }: { children: ReactNode }) {
  return <span className="text-xs font-semibold tabular-nums text-muted-foreground">{children}</span>;
}

/** A whole row that goes somewhere, as General's rows did before they moved here. */
function LinkRow({
  href,
  icon: Icon,
  title,
  detail,
  external = false,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  detail: string;
  /** Leaves the app's frame for a page of its own. */
  external?: boolean;
}) {
  const End = external ? ExternalLink : ChevronRight;
  return (
    <Link
      href={href}
      className="flex items-center gap-4 border-b px-5 py-4 transition-colors last:border-0 hover:bg-accent/50"
    >
      <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
      </div>
      <End className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

/**
 * The release the server is running, asked for rather than known.
 *
 * Every state says what it is. A dash while the answer is on its way read the
 * same as a server with no release, and a failed check the same as both.
 */
function ServerRow() {
  const server = useServerVersion();

  let detail: string;
  let value: ReactNode;
  if (server.data) {
    detail = server.commit ? `What it is running · commit ${server.commit}` : 'What it is running';
    // Null from the server itself means it was not built by the release
    // workflow, as with this build's own number.
    value = <Value>{server.version ?? 'Local build'}</Value>;
  } else if (server.isError) {
    detail = 'Could not ask it which release it is running.';
    value = server.isFetching ? (
      <Loader2 className="size-4 animate-spin text-primary" />
    ) : (
      <Button size="sm" variant="outline" onClick={() => void server.refetch()}>
        Try again
      </Button>
    );
  } else if (server.fetchStatus === 'paused') {
    // Offline in a browser: the query waits for the network rather than failing.
    detail = 'Waiting for a connection to ask it.';
    value = <Value>—</Value>;
  } else {
    detail = 'Asking it which release it is running…';
    value = <Loader2 className="size-4 animate-spin text-primary" />;
  }

  return (
    <SettingRow icon={Server} title="Server" detail={detail}>
      {value}
    </SettingRow>
  );
}

/**
 * Which Virgo this is, and what it talks to.
 *
 * Two numbers, deliberately in two rows, as on the phone. This build's is
 * stamped into it when it is built; the server's is asked for. In a browser
 * they are normally one release deployed together, but a desktop app is
 * installed and updated on its own, and a tab left open across a deploy keeps
 * the pages it loaded — collapsing them would hide exactly the case where the
 * two differ.
 *
 * The Terms link and who you are signed in as were the About card at the foot
 * of General; they live here now, as they do on the phone.
 */
export default function AboutPage() {
  const { profile } = useAuth();

  const buildDetail = [
    IS_DESKTOP ? 'The app on this computer' : 'This page, in your browser',
    APP_COMMIT && `commit ${APP_COMMIT}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Screen title="About">
      <PageHeader title="About" description="Which Virgo this is, and the server it talks to" />

      <div className="w-full max-w-3xl">
        <Card className="py-0">
          <CardContent className="flex items-center gap-4 px-5 py-5">
            <Image
              src="/logo.png"
              alt=""
              width={48}
              height={48}
              className="size-12 shrink-0 object-contain"
            />
            <div className="min-w-0">
              <p className="text-lg font-bold tracking-tight">Virgo</p>
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                A network of photographers, videographers, editors and other creatives, and the
                workspace they run the job from.
              </p>
            </div>
          </CardContent>
        </Card>

        <h2 className="mb-2 mt-8 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Versions
        </h2>
        <Card className="py-0">
          <CardContent className="p-0">
            {/* "Local build" rather than nothing: a build the release workflow
                did not stamp is not a release, and giving it a number would
                be a small lie, but a blank reads as broken. */}
            <SettingRow
              icon={IS_DESKTOP ? Monitor : Globe}
              title={IS_DESKTOP ? 'Virgo for desktop' : 'Virgo for web'}
              detail={buildDetail}
            >
              <Value>{RELEASE_LABEL ?? 'Local build'}</Value>
            </SettingRow>
            <ServerRow />
          </CardContent>
        </Card>

        <h2 className="mb-2 mt-8 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Account
        </h2>
        <Card className="py-0">
          <CardContent className="p-0">
            {/* SettingRow's shape, written out so the address can break: an
                email is one long word, and on a phone-width window a long
                one would run out of the card. */}
            <div className="flex items-center gap-4 px-5 py-4">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
                <UserRound className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  Signed in
                  {profile?.email && (
                    <>
                      {' as '}
                      <span className="break-all">{profile.email}</span>
                    </>
                  )}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  How you sign in, and how to stop, are under Account &amp; security.
                </p>
              </div>
              <Button asChild size="sm" variant="outline" className="shrink-0">
                <Link href="/settings/account">
                  Manage
                  <ChevronRight className="size-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <h2 className="mb-2 mt-8 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Legal and support
        </h2>
        <Card className="py-0">
          <CardContent className="p-0">
            <LinkRow
              href="/legal"
              icon={FileText}
              title="Terms & Privacy Policy"
              detail="What we collect, and what we do with it"
              external
            />
            <LinkRow
              href="/support"
              icon={LifeBuoy}
              title="Support"
              detail="Ask us anything. We answer in the app and by email."
            />
          </CardContent>
        </Card>
      </div>
    </Screen>
  );
}
