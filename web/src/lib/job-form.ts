/** Minimums enforced by CreateJobDto on the server; kept in step by hand. */
export const JOB_TITLE_MIN = 3;
export const JOB_DESCRIPTION_MIN = 30;

/**
 * Why the "Post it" button is disabled, in the user's own words.
 *
 * The form used to just grey the button out. Every rule here is also enforced
 * by the server, so a title one character short produced a dead button and no
 * way to find out which field was at fault — the brief had a hint, the title
 * had none, and the button said nothing at all — a title one short of the
 * minimum produced a dead end with no way to find out why.
 *
 * Returns an empty array when the post is ready to send.
 */
export function jobPostBlockers(input: {
  title: string;
  description: string;
  rolesWanted: readonly string[];
  budgetBackwards: boolean;
  /**
   * Mobile types the date by hand, so it can be malformed in a way the web
   * date input cannot. Defaults to true for callers that cannot get it wrong.
   */
  dateLooksRight?: boolean;
}): string[] {
  const reasons: string[] = [];
  const title = input.title.trim();
  const description = input.description.trim();

  const shortBy = (have: number, need: number) => {
    const gap = need - have;
    return `${gap} more character${gap === 1 ? '' : 's'}`;
  };

  if (title.length < JOB_TITLE_MIN) {
    reasons.push(
      title.length === 0
        ? 'a title'
        : `${shortBy(title.length, JOB_TITLE_MIN)} in the title`,
    );
  }
  if (input.rolesWanted.length === 0) reasons.push('at least one role');
  if (description.length < JOB_DESCRIPTION_MIN) {
    reasons.push(
      description.length === 0
        ? 'a brief'
        : `${shortBy(description.length, JOB_DESCRIPTION_MIN)} in the brief`,
    );
  }
  if (input.budgetBackwards) reasons.push('a budget that runs low to high');
  if (input.dateLooksRight === false) reasons.push('a date as YYYY-MM-DD');

  return reasons;
}

/** "a title and at least one role" — reads as a sentence, not a list. */
export function joinBlockers(reasons: readonly string[]): string {
  if (reasons.length <= 1) return reasons[0] ?? '';
  return `${reasons.slice(0, -1).join(', ')} and ${reasons[reasons.length - 1]}`;
}
