'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CONTACT_EMAIL, LAST_UPDATED, PRIVACY, TERMS } from '@/lib/legal-content';

export type LegalTab = 'terms' | 'privacy';

/**
 * The terms and the privacy policy, read over the form that asks you to
 * accept them.
 *
 * A dialog rather than a link: a link to another page threw away a half-filled
 * sign-up, and a new tab is not an option in the desktop app, which opens no
 * second window. The text is the same as /legal's, from lib/legal-content.
 */
export function LegalDialog({
  tab,
  onClose,
}: {
  /** Which document to open on, or null for closed. */
  tab: LegalTab | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={tab !== null} onOpenChange={(open) => !open && onClose()}>
      {/* Keyed so each opening starts on the document that was asked for. */}
      {tab && <LegalBody key={tab} initial={tab} />}
    </Dialog>
  );
}

function LegalBody({ initial }: { initial: LegalTab }) {
  const [tab, setTab] = useState<LegalTab>(initial);
  const clauses = tab === 'terms' ? TERMS : PRIVACY;

  return (
    <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{tab === 'terms' ? 'Terms of Service' : 'Privacy Policy'}</DialogTitle>
        <DialogDescription>Last updated {LAST_UPDATED}</DialogDescription>
      </DialogHeader>

      <Tabs value={tab} onValueChange={(v) => setTab(v as LegalTab)}>
        <TabsList className="w-full">
          <TabsTrigger value="terms" className="flex-1">
            Terms of Service
          </TabsTrigger>
          <TabsTrigger value="privacy" className="flex-1">
            Privacy Policy
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6">
        <div className="flex flex-col gap-5 pb-2">
          {clauses.map((clause) => (
            <section key={clause.heading}>
              <h3 className="mb-1.5 text-sm font-bold">{clause.heading}</h3>
              {clause.body.map((paragraph, i) => (
                <p key={i} className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
          <p className="text-xs text-muted-foreground">
            Questions about this?{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
              {CONTACT_EMAIL}
            </a>
          </p>
        </div>
      </div>
    </DialogContent>
  );
}
