'use client';

import { UserX } from 'lucide-react';
import { PageHeader, Screen } from '@/components/app-shell';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { usePersonSafety } from '@/components/people/person-safety';
import { useBlocks } from '@/hooks/useBlocks';

function blockedOn(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * The people you have blocked, and the way back from each.
 *
 * The web had no list: somebody blocked on the phone could only be unblocked
 * there. Each row is what you could see of them when you blocked them, not who
 * they are now: the list is for recognising someone and undoing it, and it
 * must not keep telling you about an account you asked never to hear from.
 */
export default function BlockedPeoplePage() {
  const { blocks, isLoading, loadFailed, refetch } = useBlocks();
  const safety = usePersonSafety('profile');

  return (
    <Screen title="Blocked people">
      <PageHeader
        title="Blocked people"
        // Short, since the bar has one line for it; the block dialog says the rest.
        description="People you block can't message you or find you. They aren't told."
      />

      <div className="w-full max-w-3xl">
        {isLoading && blocks.length === 0 ? (
          <ListSkeleton rows={3} />
        ) : loadFailed && blocks.length === 0 ? (
          <ErrorState message="Could not load your blocked list." onRetry={() => refetch()} />
        ) : blocks.length === 0 ? (
          <Card>
            <EmptyState
              icon={UserX}
              title="You haven’t blocked anyone"
              description="If someone bothers you, open their profile or your chat with them and choose Block."
            />
          </Card>
        ) : (
          <Card className="py-0">
            <CardContent className="p-0">
              <ul>
                {blocks.map((person) => (
                  <li
                    key={person.id}
                    className="flex items-center gap-3 border-b px-5 py-3.5 last:border-0"
                  >
                    {/* The initial under the photograph: a snapshot avatar
                        that has since been replaced no longer loads. */}
                    <Avatar className="size-10">
                      {person.avatarUrl && <AvatarImage src={person.avatarUrl} alt="" />}
                      <AvatarFallback className="bg-primary/10 text-sm font-bold text-primary">
                        {person.name.trim().charAt(0).toUpperCase() || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{person.name}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        Blocked {blockedOn(person.blockedAt)}
                        {/* Not a link: across a block their profile does not
                            open, so the handle is only for recognising them. */}
                        {person.handle && <> · @{person.handle}</>}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`Unblock ${person.name}`}
                      disabled={safety.pending}
                      onClick={() => safety.unblock({ name: person.name, blockId: person.id })}
                    >
                      Unblock
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {safety.dialogs}
    </Screen>
  );
}
