import { LegalPage, legalMetadata } from '../legal-page';
import { TERMS } from '@/lib/legal-content';

export const metadata = legalMetadata(
  'Terms',
  '/terms',
  'The terms you agree to when you use Virgo — accounts, content ownership, payment and cancellation.',
);

export default function TermsPage() {
  return (
    <LegalPage
      heading="Terms of Service"
      intro="What you can expect from Virgo, and what we expect from you. Plain language on purpose."
      clauses={TERMS}
    />
  );
}
