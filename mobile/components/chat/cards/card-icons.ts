import {
  BriefcaseIcon,
  CalendarPlusIcon,
  ClipboardCheckIcon,
  FileTextIcon,
  GalleryVerticalEndIcon,
  ImageIcon,
  ImagesIcon,
  MessageSquareTextIcon,
  MicIcon,
  ReceiptIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import type { ConversationMessage } from '@/src/api';

for (const Icon of [
  BriefcaseIcon, CalendarPlusIcon, ClipboardCheckIcon, FileTextIcon, GalleryVerticalEndIcon,
  ImageIcon, ImagesIcon,
  MessageSquareTextIcon, MicIcon, ReceiptIcon, WalletIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

type MessageKind = NonNullable<ConversationMessage['kind']>;

/**
 * The one icon each kind of card goes by: on the + sheet's tile, on the card,
 * and on the held copy. Registered with cssInterop here, so a className
 * colour reaches them wherever this map is read.
 */
export const CARD_ICON: Record<Exclude<MessageKind, 'text' | 'notice'>, LucideIcon> = {
  'job-accepted': BriefcaseIcon,
  'pay-card': WalletIcon,
  'album-photos': ImagesIcon,
  booking: ClipboardCheckIcon,
  'job-post': BriefcaseIcon,
  post: GalleryVerticalEndIcon,
  package: ReceiptIcon,
  'date-plan': CalendarPlusIcon,
  // From your phone (phase 4): the + sheet's Photos and A file.
  photos: ImageIcon,
  file: FileTextIcon,
  // A voice note (phase 5), as a pin or a held copy shows it.
  voice: MicIcon,
};

/** Saved replies' tile, which is not a card. */
export const SAVED_REPLIES_ICON: LucideIcon = MessageSquareTextIcon;

/**
 * Cards that are nobody's side of the conversation: drawn centred, full
 * width, and lifted from the left when held. A booking is an agreement
 * between two people, not one person's line.
 */
export function isCentredCard(kind: ConversationMessage['kind']): boolean {
  return kind === 'job-accepted' || kind === 'booking';
}
