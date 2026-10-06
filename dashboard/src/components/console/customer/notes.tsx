'use client';

import { useState } from 'react';
import { Pin, PinOff } from 'lucide-react';
import type { CustomerNote } from '@/api/console';
import { useAddNote, useMe, useNotes, useRemoveNote, useUpdateNote } from '@/hooks/useConsole';
import { DataState, when } from '@/components/console/primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

/**
 * Internal notes on the account: what was promised, what was tried, what to
 * watch for. Never shown to the customer. Pinned notes also sit on the
 * overview, where the next person to open the account will see them first.
 */
export function NotesTab({ id }: { id: string }) {
  const { can } = useMe();
  const { data, isLoading, isError, refetch } = useNotes(id);
  const add = useAddNote(id);
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);

  return (
    <div className="space-y-4">
      {can('users.notes') && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate(
              { body, pinned },
              {
                onSuccess: () => {
                  setBody('');
                  setPinned(false);
                },
              },
            );
          }}
          className="rounded-lg border bg-card p-3"
        >
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="What happened, what you promised, what the next person should know. Only staff see this."
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
                className="size-4 accent-primary"
              />
              Pin to the top of the account
            </label>
            <Button type="submit" size="sm" disabled={!body.trim() || add.isPending}>
              Save note
            </Button>
          </div>
        </form>
      )}

      <DataState
        isLoading={isLoading}
        isError={isError}
        isEmpty={!!data && data.length === 0}
        emptyLabel="No notes on this account"
        onRetry={() => void refetch()}
      >
        <ul className="space-y-2">
          {data?.map((note) => <NoteItem key={note.id} id={id} note={note} />)}
        </ul>
      </DataState>
    </div>
  );
}

function NoteItem({ id, note }: { id: string; note: CustomerNote }) {
  const { me, can } = useMe();
  const update = useUpdateNote(id);
  const remove = useRemoveNote(id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);
  // Mirrors the API: anyone who writes notes can pin; only the author, or
  // someone who may change account security, can change or delete the words.
  const mine = note.admin_id === me?.id || can('users.security');
  const writes = can('users.notes');

  return (
    <li className={`rounded-lg border bg-card p-3 ${note.pinned ? 'border-warning/40' : ''}`}>
      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold">{note.admin_name}</span>
        <span className="text-muted-foreground" title={new Date(note.created_at).toLocaleString()}>
          {when(note.created_at)}
          {note.updated_at !== note.created_at && ' · edited'}
        </span>
        {note.pinned && (
          <Badge variant="outline" className="gap-1 border-warning/40 text-warning">
            <Pin className="size-3" /> Pinned
          </Badge>
        )}
        {writes && (
          <span className="ml-auto flex gap-1">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => update.mutate({ noteId: note.id, patch: { pinned: !note.pinned } })}
            >
              {note.pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
              {note.pinned ? 'Unpin' : 'Pin'}
            </Button>
            {mine && !editing && (
              <Button variant="ghost" size="xs" onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            {mine && (
              <Button
                variant="ghost"
                size="xs"
                className="text-destructive"
                onClick={() => confirm('Delete this note?') && remove.mutate(note.id)}
              >
                Delete
              </Button>
            )}
          </span>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} maxLength={4000} />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!draft.trim() || update.isPending}
              onClick={() =>
                update.mutate(
                  { noteId: note.id, patch: { body: draft } },
                  { onSuccess: () => setEditing(false) },
                )
              }
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap wrap-anywhere text-sm leading-relaxed">{note.body}</p>
      )}
    </li>
  );
}
