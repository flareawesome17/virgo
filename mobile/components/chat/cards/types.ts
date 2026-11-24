import type { ReactNode, Ref } from 'react';
import type { View } from 'react-native';
import type { ConversationMessage } from '@/src/api';
import type { ChatPeople } from './card-words';

/** What every card in the thread is drawn from. */
export interface CardProps {
  message: ConversationMessage;
  mine: boolean;
  /** The sender's name over the card, in a group; null when not shown. */
  senderName: string | null;
  /** The line under the card: when, and for yours how far it has got. */
  meta: string;
  /** Measured by the thread to lift the card in place when held. */
  cardRef: Ref<View>;
  onHold: () => void;
  /** Its reactions. */
  pills: ReactNode;
  myId: string | undefined;
  people: ChatPeople;
  /** Pictures load by themselves on this connection and setting. Words always show. */
  autoLoadMedia: boolean;
  /** A short word over the foot of the thread: a failed answer. */
  notify: (words: string) => void;
}
