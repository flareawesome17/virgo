'use client';

import { useRouter, useSelectedLayoutSegment } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { ConversationList } from '@/components/chat/conversation-list';
import { NewChatDialog } from '@/components/chat/new-chat-dialog';
import { cn } from '@/lib/utils';

/**
 * Master-detail, which is the point of doing chat on a wide screen at all:
 * the conversation list stays put while you read a thread, so switching
 * between two people is one click rather than back-then-forward.
 *
 * Under `lg` only one pane shows at a time — the list when no thread is
 * selected, the thread when one is — which is the phone behaviour, reached by
 * hiding a pane rather than by a second implementation.
 */
export default function ChatLayout({ children }: { children: ReactNode }) {
  const segment = useSelectedLayoutSegment();
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  // The dynamic route renders as its param value; null means /chat itself.
  const activeId = segment && segment !== '__PAGE__' ? segment : undefined;

  return (
    <AppShell title="Chat">
      <div className="flex h-full">
        <div
          className={cn(
            'w-full shrink-0 border-r lg:block lg:w-80',
            activeId ? 'hidden' : 'block',
          )}
        >
          <ConversationList activeId={activeId} onNewChat={() => setCreating(true)} />
        </div>

        <div className={cn('min-w-0 flex-1', activeId ? 'block' : 'hidden lg:block')}>
          {children}
        </div>
      </div>

      <NewChatDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(id) => router.push(`/chat/${id}`)}
      />
    </AppShell>
  );
}
