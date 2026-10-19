import { Camera, Laptop } from 'lucide-react';
import { DEVICES, type Source } from '../data/strings/ch5';
import { Avatar } from './avatar';

/**
 * Where a gold thread starts in Ch5: Mika's camera, Ernie's camera, Kenn's
 * laptop. Page chrome, not Virgo UI — a tag for a device, carrying its
 * owner's face as the workspace draws it (PersonAvatar: first and last
 * initials on primary/15), so the face here is the face in the activity
 * feed a few beats later.
 *
 * Dark on purpose: devices are dark objects, and a dark chip holds its
 * contrast on every stop of the golden ground and on night alike. Everything
 * it draws stays inside its own box, so it can sit in a Slab (which clips)
 * or fly along a thread without anything trailing.
 *
 * States, styled from the root's `data-state`:
 * - `idle`: the device, nothing sent yet. Its name sits centred.
 * - `sending`: the warm ring glows; tiles are leaving along the thread.
 * - `sent` (rest): the name moves up and what arrived from it shows below,
 *   "248 photos". Its legend role in the reduced-motion figure.
 * The name moves by transform and the count fades by opacity; the chip
 * never changes size, so a stage can tween between them in place.
 *
 * Parts: device-chip (data-who, data-state), device-pulse, device-label,
 * device-count, device-icon, device-port (the point a thread leaves from;
 * measure its rect). The face is the shared Avatar (data-part avatar).
 */

export type DeviceChipState = 'idle' | 'sending' | 'sent';

/** Where the port sits: inside the chip's edge, on the side the thread leaves from. */
const PORT = {
  right: 'right-[5px] top-1/2 -mt-[3.5px]',
  left: 'left-[5px] top-1/2 -mt-[3.5px]',
  top: 'top-[4px] left-1/2 -ml-[3.5px]',
  bottom: 'bottom-[4px] left-1/2 -ml-[3.5px]',
} as const;

/** Room for the port on its side. */
const PAD = {
  right: 'pl-2 pr-[22px]',
  left: 'pl-[22px] pr-2.5',
  top: 'pl-2 pr-2.5',
  bottom: 'pl-2 pr-2.5',
} as const;

export function DeviceChip({
  who,
  state = 'sent',
  port = 'right',
  className = '',
}: {
  who: Source;
  state?: DeviceChipState;
  /** The side the thread leaves from. */
  port?: keyof typeof PORT;
  className?: string;
}) {
  const device = DEVICES.find((d) => d.who === who) ?? DEVICES[0];
  const Icon = device.icon === 'laptop' ? Laptop : Camera;

  return (
    <div
      aria-hidden
      data-part="device-chip"
      data-who={who}
      data-state={state}
      className={`group/chip relative inline-flex items-center gap-2.5 overflow-hidden rounded-[18px] border border-[#362F2B] bg-[#1E1B18] py-2 ${PAD[port]} font-sans text-[#F2EDE8] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ${className}`}
    >
      <span
        data-part="device-pulse"
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 shadow-[inset_0_0_0_1.5px_#E0A97C,inset_0_0_22px_rgba(224,169,124,0.28)] group-data-[state=sending]/chip:opacity-100"
      />
      <Avatar surface="workspace" name={device.name} size={32} />
      <span className="flex min-w-0 flex-col pr-1">
        <span
          data-part="device-label"
          className="translate-y-2 whitespace-nowrap text-[13px] font-semibold leading-[18px] group-data-[state=sent]/chip:translate-y-0"
        >
          {device.label}
        </span>
        <span
          data-part="device-count"
          className="whitespace-nowrap text-[12px] leading-4 tabular-nums text-[#A08E84] opacity-0 group-data-[state=sent]/chip:opacity-100"
        >
          {device.count}
        </span>
      </span>
      <span
        data-part="device-icon"
        className="grid size-8 shrink-0 place-items-center rounded-full bg-[rgba(209,138,90,0.12)] text-[#D18A5A]"
      >
        <Icon aria-hidden className="size-4" strokeWidth={1.9} />
      </span>
      <span
        data-part="device-port"
        className={`absolute size-[7px] rounded-full bg-[#F0C88E] shadow-[0_0_0_2.5px_rgba(240,200,142,0.2),0_0_8px_rgba(240,200,142,0.6)] ${PORT[port]}`}
      />
    </div>
  );
}
