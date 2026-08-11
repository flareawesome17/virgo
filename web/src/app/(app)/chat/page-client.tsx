'use client';

import { MessageCircle } from 'lucide-react';
import { EmptyState } from '@/components/states';

/** The empty right-hand pane, shown until a conversation is picked. */
export default function ChatIndexPage() {
  return (
    <div className="grid h-full place-items-center">
      <EmptyState
        icon={MessageCircle}
        title="Pick a conversation"
        description="Choose someone on the left, or start a new chat."
      />
    </div>
  );
}
