import { cn } from '@/lib/utils';
import { Reveal } from './reveal';

/**
 * The header block every section opens with.
 *
 * This markup was copy-pasted into six files, identical to the character.
 * One component, with the variance made explicit — `align`, `size` and `tone`
 * are the knobs that let a section be loud or quiet, dark or light, on
 * purpose, instead of every section being the same medium.
 */
export function SectionHeader({
  eyebrow,
  title,
  lead,
  align = 'left',
  size = 'md',
  tone = 'dark',
  index,
  className,
}: {
  eyebrow: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  /** Centre is the exception, not the default. */
  align?: 'left' | 'center';
  /**
   * `xl` is the page's typographic peak and belongs to exactly one section.
   * Nothing on this page was ever allowed to be big, which is most of why it
   * read as flat at any distance.
   */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** `light` is for the one inverted section. */
  tone?: 'dark' | 'light';
  /** A plate-style index, e.g. "04". Mono, so it reads as a mark not a word. */
  index?: string;
  className?: string;
}) {
  const centred = align === 'center';
  const light = tone === 'light';

  return (
    <div
      className={cn(
        'max-w-2xl',
        centred && 'mx-auto text-center',
        size === 'lg' && 'max-w-3xl',
        size === 'xl' && 'max-w-none',
        className,
      )}
    >
      <Reveal from={centred ? 'up' : 'left'} duration={420}>
        <span
          className={cn(
            'figure flex items-center gap-2.5 text-[11px] font-semibold uppercase',
            light ? 'text-[#a85f38]' : 'text-[#c17745]',
            centred && 'justify-center',
          )}
        >
          {index && (
            <>
              <span className={light ? 'text-[#1e1b18]/35' : 'text-white/25'}>
                {index}
              </span>
              <span
                aria-hidden
                className={cn('h-px w-6', light ? 'bg-[#1e1b18]/20' : 'bg-white/15')}
              />
            </>
          )}
          {eyebrow}
        </span>
      </Reveal>

      <Reveal from={centred ? 'up' : 'left'} delay={70} duration={520}>
        <h2
          className={cn(
            'mt-4 text-balance font-extrabold tracking-tight',
            light ? 'text-[#1e1b18]' : 'text-white',
            size === 'sm' && 'text-2xl sm:text-[2rem] sm:leading-[1.15]',
            size === 'md' && 'text-3xl sm:text-[2.6rem] sm:leading-[1.1]',
            size === 'lg' &&
              'text-[2.25rem] leading-[1.05] sm:text-[3.4rem] lg:text-[3.9rem]',
            // Clamped rather than stepped: at this size a breakpoint jump is
            // the difference between filling the line and wrapping to three.
            size === 'xl' &&
              'text-[clamp(2.75rem,9vw,7.5rem)] leading-[0.92] tracking-[-0.03em]',
          )}
        >
          {title}
        </h2>
      </Reveal>

      {lead && (
        <Reveal from={centred ? 'up' : 'left'} delay={130} duration={600}>
          <p
            className={cn(
              'mt-4 text-pretty leading-relaxed',
              light ? 'text-[#54433c]' : 'text-white/55',
              size === 'lg' || size === 'xl'
                ? 'max-w-2xl text-base sm:text-[17px]'
                : 'text-[15px]',
              centred && 'mx-auto',
            )}
          >
            {lead}
          </p>
        </Reveal>
      )}
    </div>
  );
}
