import { cn } from '@/lib/utils';
import { Reveal } from './reveal';

/**
 * The header block every section opens with.
 *
 * This markup was copy-pasted into six files, identical to the character —
 * same eyebrow, same `sm:text-[2.6rem]` heading, same lead paragraph, same
 * centre alignment. Six sections opening the same way is most of what made the
 * page read as one long template.
 *
 * One component, with the variance made explicit. `align` and `size` are the
 * knobs that let a section be loud or quiet on purpose, instead of every
 * section being the same medium.
 */
export function SectionHeader({
  eyebrow,
  title,
  lead,
  align = 'left',
  size = 'md',
  index,
  className,
}: {
  eyebrow: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  /** Centre is now the exception, not the default. */
  align?: 'left' | 'center';
  /** `lg` is for the two or three sections that carry the page. */
  size?: 'sm' | 'md' | 'lg';
  /** A plate-style index, e.g. "02". Mono, so it reads as a mark not a word. */
  index?: string;
  className?: string;
}) {
  const centred = align === 'center';

  return (
    <div
      className={cn(
        'max-w-2xl',
        centred && 'mx-auto text-center',
        size === 'lg' && 'max-w-3xl',
        className,
      )}
    >
      <Reveal from={centred ? 'up' : 'left'}>
        <span
          className={cn(
            'figure flex items-center gap-2.5 text-[11px] font-semibold uppercase text-[#c17745]',
            centred && 'justify-center',
          )}
        >
          {index && (
            <>
              <span className="text-white/25">{index}</span>
              <span aria-hidden className="h-px w-6 bg-white/15" />
            </>
          )}
          {eyebrow}
        </span>
      </Reveal>

      <Reveal from={centred ? 'up' : 'left'} delay={70}>
        <h2
          className={cn(
            'mt-4 text-balance font-extrabold tracking-tight text-white',
            size === 'sm' && 'text-2xl sm:text-[2rem] sm:leading-[1.15]',
            size === 'md' && 'text-3xl sm:text-[2.6rem] sm:leading-[1.1]',
            size === 'lg' &&
              'text-[2.25rem] leading-[1.05] sm:text-[3.4rem] lg:text-[3.9rem]',
          )}
        >
          {title}
        </h2>
      </Reveal>

      {lead && (
        <Reveal from={centred ? 'up' : 'left'} delay={130}>
          <p
            className={cn(
              'mt-4 text-pretty leading-relaxed text-white/55',
              size === 'lg' ? 'text-base sm:text-[17px]' : 'text-[15px]',
            )}
          >
            {lead}
          </p>
        </Reveal>
      )}
    </div>
  );
}
