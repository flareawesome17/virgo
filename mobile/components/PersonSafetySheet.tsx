import { useRef, useState } from 'react';
import { Alert } from 'react-native';
import { ActionSheet } from '@/components/WorkspaceBits';
import { ReportSheet } from '@/components/ReportSheet';
import { useBlockPerson, useReportPerson, useUnblock } from '@/src/hooks';
import {
  ApiError,
  USER_REPORT_REASONS,
  type BlockedPerson,
  type PersonRef,
  type ReportSource,
  type UserReportReason,
} from '@/src/api';

/**
 * What a failed block, unblock or report says.
 *
 * Never the raw message. A 400 is the exception because its text is the API's
 * own copy for something the person did — "You cannot block yourself" — and
 * says more than a generic line could. Everything else is worded here, which
 * also covers an older API that has no /blocks at all: its 404 reads as the
 * person being gone rather than as "Cannot POST /blocks".
 */
export function safetyError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return "You're offline. Try again when you're connected.";
    if (err.status === 429) return "You've done this a lot in a short time. Try again later.";
    if (err.status === 400) return err.message;
    if (err.status === 404) return "We couldn't find that person. They may have left Virgo.";
  }
  return 'Something went wrong. Please try again.';
}

/** How the sheets address someone: by first name, as a person would. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** The block confirmation, worded once for every screen that offers it. */
export function askToBlock(name: string, onConfirm: () => void): void {
  const first = firstName(name);
  Alert.alert(
    `Block ${first}?`,
    "They won't be able to message you, send you connection requests, enquiries or invitations, or apply to your jobs, and you won't see each other in search, Nearby or the job board. Anything between you that's still waiting for an answer — connection requests, enquiries, job applications and invitations — is closed. Your chat history stays, and in groups you share you'll both stay but won't be notified about each other. We won't tell them.",
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: onConfirm },
    ],
  );
}

/** The unblock confirmation. Says plainly that the connection is not restored. */
export function askToUnblock(name: string, onConfirm: () => void): void {
  const first = firstName(name);
  Alert.alert(
    `Unblock ${first}?`,
    "They'll be able to find you and send you requests again. Your connection isn't restored — send a new request if you want to reconnect.",
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unblock', onPress: onConfirm },
    ],
  );
}

/**
 * Report, block and unblock for one person, without the menu.
 *
 * For screens that put these on rows of their own — chat info — rather than
 * behind a More button. `sheets` is the report sheet and has to be rendered
 * for `openReport` to show anything.
 *
 * `target` may be null while the screen is still loading; every action is a
 * no-op until it is set.
 */
export function usePersonSafety({
  name,
  target,
  source,
  blockId,
  onBlocked,
  onUnblocked,
}: {
  name: string;
  target: PersonRef | null;
  source: ReportSource;
  blockId?: string | null;
  onBlocked?: (block: BlockedPerson) => void;
  onUnblocked?: () => void;
}) {
  const block = useBlockPerson();
  const unblock = useUnblock();
  const report = useReportPerson();
  const first = firstName(name);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  /** What to show once the report sheet has finished closing. */
  const after = useRef<(() => void) | null>(null);

  const confirmBlock = () => {
    if (!target) return;
    askToBlock(name, () =>
      block.mutate(target, {
        onSuccess: (blocked) => {
          Alert.alert(
            'Blocked',
            `${first} is blocked. You can unblock them in Settings > Blocked people.`,
          );
          onBlocked?.(blocked);
        },
        onError: (err) => Alert.alert('Could not block', safetyError(err)),
      }),
    );
  };

  const confirmUnblock = () => {
    if (!blockId) return;
    askToUnblock(name, () =>
      unblock.mutate(blockId, {
        onSuccess: () => onUnblocked?.(),
        onError: (err) => Alert.alert('Could not unblock', safetyError(err)),
      }),
    );
  };

  const openReport = () => {
    if (!target) return;
    setReportError(null);
    setReportOpen(true);
  };

  const submitReport = (reason: UserReportReason, note: string) => {
    if (!target) return;
    setReportError(null);
    report.mutate(
      { ref: target, reason, note, from: source },
      {
        onSuccess: () => {
          // Queued, not shown: the sheet is still on screen, and iOS drops an
          // alert raised while a modal is on its way out.
          after.current = () =>
            Alert.alert('Thanks for telling us', 'We’ll review it.', [
              { text: 'Done' },
              ...(blockId
                ? []
                : [{ text: `Block ${first}`, style: 'destructive' as const, onPress: confirmBlock }]),
            ]);
          setReportOpen(false);
        },
        onError: (err) => setReportError(safetyError(err)),
      },
    );
  };

  const sheets = (
    <ReportSheet
      visible={reportOpen}
      title={`Report ${first}`}
      hint="Reports are private. They won't know it was you."
      reasons={USER_REPORT_REASONS}
      pending={report.isPending}
      error={reportError}
      onSubmit={submitReport}
      onClose={() => setReportOpen(false)}
      onClosed={() => {
        const run = after.current;
        after.current = null;
        run?.();
      }}
    />
  );

  return {
    openReport,
    confirmBlock,
    confirmUnblock,
    sheets,
    pending: block.isPending || unblock.isPending,
  };
}

/** Who the menu is about, as it was when it opened. */
interface Subject {
  key: string;
  name: string;
  target: PersonRef;
  blockId: string | null;
}

/**
 * The More menu for a person: report, and block or unblock.
 *
 * One per screen, fed whichever row was tapped. A list screen clears its
 * selection the moment the menu closes — which is before the report sheet or
 * the confirmation it leads to has opened — so the person is held here from
 * the moment the menu shows, and what follows still knows who it is about.
 */
export function PersonSafetySheet({
  visible,
  onClose,
  name,
  target,
  source,
  blockId,
  onBlocked,
  onUnblocked,
}: {
  visible: boolean;
  onClose: () => void;
  name: string;
  /** Null while nothing is selected; the menu stays shut. */
  target: PersonRef | null;
  source: ReportSource;
  blockId?: string | null;
  onBlocked?: (block: BlockedPerson) => void;
  onUnblocked?: () => void;
}) {
  const [held, setHeld] = useState<Subject | null>(null);
  const key = target ? `${JSON.stringify(target)}|${name}|${blockId ?? ''}` : null;
  if (visible && target && key && held?.key !== key) {
    setHeld({ key, name, target, blockId: blockId ?? null });
  }

  const subject = visible && target && key
    ? { key, name, target, blockId: blockId ?? null }
    : held;

  const safety = usePersonSafety({
    name: subject?.name ?? '',
    target: subject?.target ?? null,
    source,
    blockId: subject?.blockId ?? null,
    onBlocked,
    onUnblocked,
  });
  const first = firstName(subject?.name ?? '');

  return (
    <>
      <ActionSheet
        visible={visible && !!target}
        title={subject?.name ?? ''}
        actions={[
          { label: `Report ${first}`, onPress: safety.openReport },
          subject?.blockId
            ? { label: `Unblock ${first}`, onPress: safety.confirmUnblock }
            : { label: `Block ${first}`, destructive: true, onPress: safety.confirmBlock },
        ]}
        onClose={onClose}
      />
      {safety.sheets}
    </>
  );
}
