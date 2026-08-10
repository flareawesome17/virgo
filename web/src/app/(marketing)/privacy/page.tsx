import { LegalPage, legalMetadata } from '../legal-page';
import { PRIVACY } from '@/lib/legal-content';

export const metadata = legalMetadata(
  'Privacy Policy',
  '/privacy',
  'What Virgo collects, who it is shared with, how long it is kept, and how to get it deleted.',
);

export default function PrivacyPage() {
  return (
    <LegalPage
      heading="Privacy Policy"
      intro="What we collect, who sees it, and how long we keep it. Your work is private unless you share it."
      clauses={PRIVACY}
    />
  );
}
