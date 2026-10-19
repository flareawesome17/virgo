import { useState } from 'react';
import { Alert } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { ReportSheet } from '@/components/ReportSheet';
import {
  SHOWCASE_REPORT_REASONS,
  showcaseReportsApi,
  type ShowcaseReportReason,
} from '@/src/api';
import { profileActionMessage } from '@/src/lib/profile-media';

/**
 * Reporting a post.
 *
 * The same sheet an account report uses, with the reasons a photograph needs —
 * a post can be somebody else's work or credited to the wrong person, which
 * an account cannot be, and it cannot be impersonation, which is about who
 * somebody claims to be.
 *
 * Reporting the post rather than the person is the point: "report this
 * account" is heavier than most situations warrant, and says nothing about
 * which of their posts is the problem.
 */
export function ShowcaseReportSheet({
  showcaseId,
  onClose,
}: {
  showcaseId: string | null;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const report = useMutation({
    mutationFn: ({ reason, note }: { reason: ShowcaseReportReason; note: string }) =>
      showcaseReportsApi.report(showcaseId!, reason, note || undefined),
  });

  return (
    <ReportSheet<ShowcaseReportReason>
      visible={showcaseId !== null}
      title="Report this post"
      hint="Somebody at Virgo reads every report. The person who posted it is not told who reported it."
      reasons={SHOWCASE_REPORT_REASONS.map((r) => ({ value: r.value, label: r.label }))}
      pending={report.isPending}
      error={error}
      onSubmit={(reason, note) => {
        setError(null);
        report.mutate(
          { reason, note },
          {
            onSuccess: () => {
              onClose();
              // After the sheet has gone, so the alert is not stacked on it.
              setTimeout(
                () =>
                  Alert.alert(
                    'Thank you',
                    'Somebody will look at this post. You will not hear back about it unless we need to ask you something.',
                  ),
                350,
              );
            },
            onError: (err) => setError(profileActionMessage(err, 'report')),
          },
        );
      }}
      onClose={onClose}
      onClosed={() => setError(null)}
    />
  );
}
