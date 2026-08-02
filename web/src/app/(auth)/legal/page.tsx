'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ArrowLeft, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  CONTACT_EMAIL,
  LAST_UPDATED,
  PRIVACY,
  TERMS,
} from '@/lib/legal-content';

function LegalContent() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<'terms' | 'privacy'>(
    searchParams.get('tab') === 'privacy' ? 'privacy' : 'terms',
  );

  const clauses = tab === 'terms' ? TERMS : PRIVACY;

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <div className="flex items-center gap-3">
        <Button asChild size="icon" variant="ghost" className="-ml-2">
          <Link href="/" aria-label="Back">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Legal</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Last updated {LAST_UPDATED}
          </p>
        </div>
        <ThemeToggle />
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as 'terms' | 'privacy')}
        className="mt-6"
      >
        <TabsList className="w-full">
          <TabsTrigger value="terms" className="flex-1">
            Terms of Service
          </TabsTrigger>
          <TabsTrigger value="privacy" className="flex-1">
            Privacy Policy
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-6 flex flex-col gap-5">
        {clauses.map((clause) => (
          <section key={clause.heading}>
            <h2 className="mb-2 text-base font-bold">{clause.heading}</h2>
            <Card>
              <CardContent className="flex flex-col gap-3 py-4">
                {clause.body.map((paragraph, i) => (
                  <p key={i} className="text-sm leading-relaxed text-muted-foreground">
                    {paragraph}
                  </p>
                ))}
              </CardContent>
            </Card>
          </section>
        ))}
      </div>

      <Card className="mt-6">
        <CardContent className="flex items-center gap-3 py-4">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10">
            <Mail className="size-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Questions about this?</p>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-xs text-primary hover:underline"
            >
              {CONTACT_EMAIL}
            </a>
          </div>
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        By continuing to use Virgo you accept these terms.
      </p>
    </div>
  );
}

/**
 * Terms and privacy, readable without an account.
 *
 * In the (auth) group rather than behind the guard: the sign-in page links
 * here, and terms you have to authenticate to read are not terms you can agree
 * to before signing up.
 */
export default function LegalPage() {
  return (
    <Suspense fallback={null}>
      <LegalContent />
    </Suspense>
  );
}
