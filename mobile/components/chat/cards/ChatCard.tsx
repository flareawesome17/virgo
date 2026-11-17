import type { CardKind } from '@/src/api';
import { AlbumPhotosCard } from './AlbumPhotosCard';
import { BookingCard } from './BookingCard';
import { DateCard } from './DateCard';
import { JobPostCard } from './JobPostCard';
import { PackageCard } from './PackageCard';
import { PostCard } from './PostCard';
import type { CardProps } from './types';

/** A Virgo thing shared in the chat, drawn as its kind's card. */
export function ChatCard({ kind, ...props }: CardProps & { kind: CardKind }) {
  switch (kind) {
    case 'album-photos':
      return <AlbumPhotosCard {...props} />;
    case 'booking':
      return <BookingCard {...props} />;
    case 'job-post':
      return <JobPostCard {...props} />;
    case 'post':
      return <PostCard {...props} />;
    case 'package':
      return <PackageCard {...props} />;
    case 'date-plan':
      return <DateCard {...props} />;
  }
}
