'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Thread } from '@/components/chat/thread';
import { ConversationInfo } from '@/components/chat/conversation-info';

/**
 * One conversation.
 *
 * `useParams` rather than the page's `params` prop: Next 16 makes that prop a
 * Promise, and this tree is a client component anyway.
 */
export default function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <>
      <Thread
        conversationId={id}
        onBack={() => router.push('/chat')}
        onOpenInfo={() => setInfoOpen(true)}
      />
      <ConversationInfo
        conversationId={id}
        open={infoOpen}
        onOpenChange={setInfoOpen}
        onLeft={() => router.push('/chat')}
      />
    </>
  );
}
