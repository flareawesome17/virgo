import { COHORTS, METER, STORAGE } from '../data/story';
import { BASELINE_FILES, METER_UI, meterPlanLine } from '../data/strings/ch5';

/**
 * Mika's one storage meter. Everything the crew uploads into her album counts
 * against her 15 GB, so the meter is hers alone: it fills on Saturday night
 * (Ch5) and drains with each clean-up (Ch7).
 *
 * The figures are the app's `formatBytes` (copied: importing it from `@/api`
 * would pull in the API client) over the readings in `story.ts`, taken as
 * GiB, which is what the app calls GB: "6.3 GB", "of 15.0 GB". Anything under
 * 1 GiB the app writes in MB, so the 0.3 GB baseline reads "307 MB".
 *
 * - `platform="web"` follows `settings/storage/page-client.tsx`: the Card
 *   (16.8 px radius, ring foreground/10), "6.3 GB" at 30 px bold, "of 15.0 GB
 *   on the free plan", the file count on the right, then the 8 px bar. The
 *   card's tiles below the bar are left out.
 * - `platform="phone"` follows the home tab's card and `StorageRing.tsx`: a
 *   96 px ring (11 px stroke, from 12 o'clock, round caps) with the percent
 *   and "USED" inside, then "STORAGE", "6.3 GB used", "8.7 GB left". The
 *   ring's "used" is 9 px in the app; 11 px here, the story's floor (§1.6).
 *
 * Motion is compositor-only. The bar fill is scaleX(fraction). The ring is
 * two half-rings in half-clips, turned by rotate — `ring-arc-a` by
 * min(360f, 180)°, `ring-arc-b` by max(0, 360f − 180)° — with
 * `ring-cap-end` turned by 360f° for the round end. Never a stroke-dash.
 * Readings are text: write them into the reserved-width tabular spans.
 *
 * States: `baseline` (0.3 GB, before Saturday) · `saturday` (rest: 6.3 GB) ·
 * `beforeCleanUp` (9.2 GB, Day 21 to Day 91) · `day91` (3.2) · `day92` (2.8)
 * · `day112` (0.3).
 *
 * Parts: storage-meter (data-state), meter-used, meter-files, meter-track,
 * meter-fill (web); ring, ring-arc-a, ring-arc-b, ring-cap-start,
 * ring-cap-end, ring-label, meter-left (phone).
 */

export type StorageMeterState = 'baseline' | 'saturday' | 'beforeCleanUp' | 'day91' | 'day92' | 'day112';

const [SATURDAY, SUNDAY, FILMS] = COHORTS;

const READING: Record<StorageMeterState, { gb: number; files: number }> = {
  baseline: { gb: STORAGE.baselineGb, files: BASELINE_FILES },
  saturday: { gb: METER.saturday, files: BASELINE_FILES + SATURDAY.files },
  beforeCleanUp: { gb: METER.beforeCleanUp, files: BASELINE_FILES + SATURDAY.files + SUNDAY.files + FILMS.files },
  day91: { gb: METER.afterDay91, files: BASELINE_FILES + SUNDAY.files + FILMS.files },
  day92: { gb: METER.afterDay92, files: BASELINE_FILES + FILMS.files },
  day112: { gb: METER.afterDay112, files: BASELINE_FILES },
};

const GIB = 1024 ** 3;

/** `web/src/api/endpoints/usage.ts › formatBytes`, line for line. */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** What the meter reads in a state, as the apps would print it. */
export function meterReading(state: StorageMeterState) {
  const { gb, files } = READING[state];
  const used = Math.round(gb * GIB);
  const limit = Math.round(STORAGE.planGb * GIB);
  const fraction = Math.max(0, Math.min(1, used / limit));
  const percent = fraction * 100;
  return {
    used: formatBytes(used),
    limit: formatBytes(limit),
    left: formatBytes(Math.max(limit - used, 0)),
    files,
    fraction,
    /** StorageRing's label: two decimals under 1 %, whole numbers above. */
    percent: percent > 0 && percent < 1 ? `${percent.toFixed(2)}%` : `${Math.round(percent)}%`,
  };
}

function Ring({ fraction, label }: { fraction: number; label: string }) {
  const angle = Math.round(fraction * 3600) / 10;
  const a = Math.min(angle, 180);
  const b = Math.max(0, angle - 180);
  const arc = fraction >= 0.9 ? '#C8503C' : '#D18A5A';
  const lit = fraction > 0 ? 1 : 0;

  return (
    <div data-part="ring" className="relative size-24 shrink-0">
      <div className="absolute inset-0 rounded-full border-[11px] border-[#2A2522]" />
      {/* 0–180°: a left half-ring turned into the right half. */}
      <div className="absolute inset-0 [clip-path:inset(0_0_0_50%)]">
        <div
          data-part="ring-arc-a"
          className="absolute inset-0 rounded-full border-[11px] [clip-path:inset(0_50%_0_0)]"
          style={{ borderColor: arc, transform: `rotate(${a}deg)` }}
        />
      </div>
      {/* 180–360°: a right half-ring turned into the left half. */}
      <div className="absolute inset-0 [clip-path:inset(0_50%_0_0)]">
        <div
          data-part="ring-arc-b"
          className="absolute inset-0 rounded-full border-[11px] [clip-path:inset(0_0_0_50%)]"
          style={{ borderColor: arc, transform: `rotate(${b}deg)` }}
        />
      </div>
      {/* Round caps, as strokeLinecap="round" draws them. */}
      <span
        data-part="ring-cap-start"
        className="absolute left-1/2 top-0 -ml-[5.5px] size-[11px] rounded-full"
        style={{ background: arc, opacity: lit }}
      />
      <div data-part="ring-cap-end" className="absolute inset-0" style={{ transform: `rotate(${angle}deg)`, opacity: lit }}>
        <span className="absolute left-1/2 top-0 -ml-[5.5px] size-[11px] rounded-full" style={{ background: arc }} />
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span data-part="ring-label" className="min-w-[4ch] text-center text-[17px] font-bold leading-[22px] tracking-tight tabular-nums">
          {label}
        </span>
        <span className="text-[11px] font-semibold uppercase leading-[13px] tracking-[0.05em] text-[#A08E84]">
          {METER_UI.used}
        </span>
      </div>
    </div>
  );
}

export function StorageMeter({
  platform,
  state = 'saturday',
  className = '',
}: {
  platform: 'web' | 'phone';
  state?: StorageMeterState;
  className?: string;
}) {
  const r = meterReading(state);

  if (platform === 'web') {
    return (
      <div
        aria-hidden
        data-part="storage-meter"
        data-state={state}
        className={`overflow-hidden rounded-xl bg-[#1E1B18] py-4 font-sans text-sm text-[#F2EDE8] ring-1 ring-[rgba(242,237,232,0.1)] ${className}`}
      >
        <div className="px-4 py-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p data-part="meter-used" className="min-w-[6ch] text-3xl font-bold tabular-nums">
                {r.used}
              </p>
              <p className="mt-1 text-sm text-[#A08E84]">{meterPlanLine(r.limit)}</p>
            </div>
            <div className="text-right">
              <p data-part="meter-files" className="min-w-[3ch] text-sm font-semibold tabular-nums">
                {r.files}
              </p>
              <p className="text-xs text-[#A08E84]">{METER_UI.files}</p>
            </div>
          </div>
          <div data-part="meter-track" className="relative mt-4 flex h-2 w-full items-center overflow-hidden rounded-full bg-[#2A2522]">
            <div
              data-part="meter-fill"
              className="size-full origin-left bg-[#D18A5A]"
              style={{ transform: `scaleX(${Math.round(r.fraction * 10000) / 10000})` }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      aria-hidden
      data-part="storage-meter"
      data-state={state}
      className={`flex items-center gap-4 rounded-[24px] border border-[rgba(54,47,43,0.4)] bg-[#1E1B18] p-4 text-[#F2EDE8] ${className}`}
    >
      <Ring fraction={r.fraction} label={r.percent} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-[11px] font-bold uppercase leading-[13px] tracking-[0.05em] text-[#A08E84]">{METER_UI.storage}</p>
        <p className="text-base font-bold leading-6">
          <span data-part="meter-used" className="tabular-nums">
            {r.used}
          </span>{' '}
          <span className="text-xs font-medium text-[#A08E84]">{METER_UI.used}</span>
        </p>
        <p className="text-base font-bold leading-6">
          <span data-part="meter-left" className="tabular-nums">
            {r.left}
          </span>{' '}
          <span className="text-xs font-medium text-[#A08E84]">{METER_UI.left}</span>
        </p>
      </div>
    </div>
  );
}
