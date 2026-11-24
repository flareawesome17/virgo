'use client';

import { useMemo, useSyncExternalStore } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import {
  ApiError,
  chatApi,
  chatRefusal,
  deliverChatFile,
  isStorageFull,
  type ChatAttachment,
  type ChatUploadTicket,
} from '@/api';
import { putToBucket } from '@/api/endpoints/storage';
import { insertThreadMessage, invalidateConversationRows, patchThreadMessages } from '@/hooks/useChat';
import { filesKeys } from '@/hooks/useChatFiles';
import { usageQueryKey } from '@/hooks/useUsage';
import { newClientId } from '@/lib/outbox';
import { prepareVoice, releasePreview, type PreparedFile } from '@/components/chat/files/prepare';

/*
 * Photos and a PDF on their way out of this computer (phase 4), and a voice
 * note recorded here (phase 5), which goes the same way as one photo.
 *
 * Words first, as on the phone: upload links, then the message — which shows
 * for everyone at once with its photos still on their way — then the bytes,
 * one file at a time, each filling in as it lands. A dropped connection never
 * fails anything: the item says "Waiting for a connection" and carries on when
 * the browser is back online, or on a backoff if the browser never noticed it
 * was gone.
 *
 * Held in memory only. A closed tab leaves a message whose photos never
 * arrive; the server marks them "didn't arrive" a day on. The phone keeps its
 * queue on disk because a phone app is closed under you; a browser tab mostly
 * is not.
 */

/** What this computer is doing with one file of a message. */
export type LocalUploadStatus = 'queued' | 'uploading' | 'waiting' | 'done' | 'failed';

export interface LocalUpload {
  file: PreparedFile;
  /** The server's id for it, from its upload link. */
  attachmentId: string | null;
  ticket: ChatUploadTicket | null;
  status: LocalUploadStatus;
  /** 0–1 of its bytes sent. */
  progress: number;
  /** An attempt has started before: its bytes may have landed, so finish is asked first. */
  tried: boolean;
  /** Why it stopped for good, in words. */
  problem: string | null;
}

/**
 * - sending: on its way, or about to be.
 * - waiting: no connection; carries on by itself.
 * - failed: refused before the message went (out of storage, say). A click retries.
 * - sent: the message is in the chat; its files may still be going.
 */
export type FilesSendStage = 'sending' | 'waiting' | 'failed' | 'sent';

export interface FilesSend {
  /** Also the message's client id, so a retry after a lost answer stores it once. */
  key: string;
  conversationId: string;
  /** A voice note is one recording, with no caption. */
  kind: 'photos' | 'file' | 'voice';
  caption: string | null;
  replyTo: { id: string; body: string; sender: string | null } | null;
  files: LocalUpload[];
  /** Set once the server has the message. */
  messageId: string | null;
  stage: FilesSendStage;
  problem: string | null;
  storageFull: boolean;
  createdAt: string;
}

/** What is said when the account has no room left (brief, item 8). */
export const STORAGE_FULL_TEXT =
  "You're out of storage. Photos, files and voice notes from this computer won't send, but messages, album photos, cards and dates always will.";

/** Sends kept for their previews after they finish, newest first, before the oldest are let go. */
const KEEP_FINISHED = 40;

let sends: FilesSend[] = [];
let unsentByConversation = new Map<string, readonly FilesSend[]>();
let byFile = new Map<string, LocalUpload>();
const listeners = new Set<() => void>();
const EMPTY: readonly FilesSend[] = [];

function emit(): void {
  const grouped = new Map<string, FilesSend[]>();
  const files = new Map<string, LocalUpload>();
  for (const send of sends) {
    if (!send.messageId) {
      const list = grouped.get(send.conversationId) ?? [];
      list.push(send);
      grouped.set(send.conversationId, list);
    }
    for (const upload of send.files) {
      files.set(upload.file.localId, upload);
      if (upload.attachmentId) files.set(upload.attachmentId, upload);
    }
  }
  unsentByConversation = grouped;
  byFile = files;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function find(key: string): FilesSend | undefined {
  return sends.find((s) => s.key === key);
}

function update(key: string, patch: Partial<FilesSend>): void {
  sends = sends.map((s) => (s.key === key ? { ...s, ...patch } : s));
  emit();
}

function updateFile(key: string, localId: string, patch: Partial<LocalUpload>): void {
  sends = sends.map((s) =>
    s.key === key
      ? { ...s, files: s.files.map((f) => (f.file.localId === localId ? { ...f, ...patch } : f)) }
      : s,
  );
  emit();
}

/** Photos and files of this chat that have not become a message yet, oldest first. */
export function useUnsentFiles(conversationId: string): readonly FilesSend[] {
  return useSyncExternalStore(
    subscribe,
    () => unsentByConversation.get(conversationId) ?? EMPTY,
    () => EMPTY,
  );
}

/** What this computer is doing with one attachment, by the server's id or its own. */
export function useLocalUpload(id: string | null | undefined): LocalUpload | undefined {
  return useSyncExternalStore(
    subscribe,
    () => (id ? byFile.get(id) : undefined),
    () => undefined,
  );
}

/**
 * Which of these attachments this computer still has its own copy of, as
 * "id|id": those draw from here and never wait for a click to load.
 */
export function useLocalCopies(ids: readonly string[]): ReadonlySet<string> {
  const key = useSyncExternalStore(
    subscribe,
    () => ids.filter((id) => byFile.get(id)?.file.previewUrl).join('|'),
    () => '',
  );
  return useMemo(() => new Set(key ? key.split('|') : []), [key]);
}

// ─── Running ─────────────────────────────────────────────────────────────────

let queryClient: QueryClient | null = null;
const running = new Set<string>();
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryDelay = 4000;
let listening = false;

function offline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** No answer at all, or the server falling over: worth trying again by itself. */
function isTransient(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true;
  return err.status === 0 || err.status === 408 || err.status >= 500;
}

/** A refusal, in words: the server's own sentence where it wrote one for people. */
function refusalWords(err: unknown): string {
  if (isStorageFull(err)) return STORAGE_FULL_TEXT;
  if (chatRefusal(err)) return "You can't send to this conversation.";
  if (err instanceof ApiError) {
    if (err.status === 404) return "That chat or message isn't here any more.";
    if ((err.status === 400 || err.status === 403 || err.status === 429) && err.message) {
      return err.message;
    }
  }
  return 'Something went wrong. Try again.';
}

function needsWork(send: FilesSend): boolean {
  if (send.stage === 'waiting' || send.stage === 'sending') return true;
  return (
    send.stage === 'sent' &&
    send.files.some((f) => f.status === 'queued' || f.status === 'waiting' || f.status === 'uploading')
  );
}

/** Everything that was waiting, now: the connection is back, or the backoff ran out. */
function kickAll(): void {
  clearTimeout(retryTimer);
  retryTimer = undefined;
  for (const send of sends) if (needsWork(send)) void run(send.key);
}

function scheduleRetry(): void {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = undefined;
    kickAll();
  }, retryDelay);
  retryDelay = Math.min(retryDelay * 2, 60_000);
}

function listen(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('online', () => {
    retryDelay = 4000;
    kickAll();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && sends.some(needsWork)) kickAll();
  });
}

/** Lets go of the oldest finished sends' previews, beyond the ones kept. */
function trim(): void {
  const finished = sends.filter((s) => s.messageId && !needsWork(s));
  if (finished.length <= KEEP_FINISHED) return;
  const drop = new Set(finished.slice(0, finished.length - KEEP_FINISHED).map((s) => s.key));
  for (const send of sends) if (drop.has(send.key)) send.files.forEach((f) => releasePreview(f.file));
  sends = sends.filter((s) => !drop.has(s.key));
  emit();
}

function asFile(prepared: PreparedFile): File {
  return prepared.blob instanceof File
    ? prepared.blob
    : new File([prepared.blob], prepared.name, { type: prepared.contentType });
}

/** A finished attachment into the cached message, for when the socket's copy is late or lost. */
function patchAttachment(conversationId: string, messageId: string, attachment: ChatAttachment): void {
  if (!queryClient) return;
  patchThreadMessages(queryClient, conversationId, (m) =>
    m.id === messageId && m.attachments
      ? { ...m, attachments: m.attachments.map((a) => (a.id === attachment.id ? attachment : a)) }
      : m,
  );
}

/** Asked for again while already running: a retry click, or the connection coming back. */
const again = new Set<string>();

async function run(key: string): Promise<void> {
  if (running.has(key)) {
    again.add(key);
    return;
  }
  running.add(key);
  try {
    do {
      again.delete(key);
      await step(key);
    } while (again.has(key));
  } finally {
    running.delete(key);
  }
  const send = find(key);
  if (send && send.messageId && !needsWork(send)) {
    // Room used, or given back: the storage readings move.
    queryClient?.invalidateQueries({ queryKey: usageQueryKey });
    queryClient?.invalidateQueries({ queryKey: filesKeys.usage });
    trim();
  }
}

/** Stops for now, saying so, and tries again by itself later. */
function wait(key: string): void {
  sends = sends.map((s) =>
    s.key === key
      ? {
          ...s,
          stage: s.messageId ? 'sent' : 'waiting',
          files: s.files.map((f) =>
            f.status === 'queued' || f.status === 'uploading' ? { ...f, status: 'waiting' } : f,
          ),
        }
      : s,
  );
  emit();
  scheduleRetry();
}

/** Refused before the message went: said on the row, and on each photo, until a click retries. */
function refuse(key: string, err: unknown): void {
  const problem = refusalWords(err);
  sends = sends.map((s) =>
    s.key === key
      ? {
          ...s,
          stage: 'failed',
          problem,
          storageFull: isStorageFull(err),
          files: s.files.map((f) => ({ ...f, status: 'failed', problem })),
        }
      : s,
  );
  emit();
}

async function step(key: string): Promise<void> {
  let send = find(key);
  if (!send) return;
  if (!send.messageId) {
    if (offline()) {
      wait(key);
      return;
    }
    sends = sends.map((s) =>
      s.key === key
        ? {
            ...s,
            stage: 'sending',
            problem: null,
            storageFull: false,
            files: s.files.map((f) => (f.status === 'waiting' ? { ...f, status: 'queued' } : f)),
          }
        : s,
    );
    emit();

    // 1. Upload links: also where an account with no room is told so.
    if (send.files.some((f) => !f.attachmentId)) {
      try {
        const tickets = await chatApi.createUploads(
          send.conversationId,
          send.files.map((f) =>
            f.file.kind === 'voice'
              ? {
                  // The server names a voice note itself; its length is
                  // what the list says before it arrives.
                  contentType: f.file.contentType,
                  contentLength: f.file.sizeBytes,
                  ...(f.file.durationMs != null ? { durationMs: Math.round(f.file.durationMs) } : {}),
                }
              : {
                  contentType: f.file.contentType,
                  contentLength: f.file.sizeBytes,
                  name: f.file.name,
                },
          ),
        );
        sends = sends.map((s) =>
          s.key === key
            ? {
                ...s,
                files: s.files.map((f, i) => ({
                  ...f,
                  attachmentId: tickets[i]?.id ?? f.attachmentId,
                  ticket: tickets[i] ?? f.ticket,
                })),
              }
            : s,
        );
        emit();
      } catch (err) {
        if (!find(key)) return;
        if (isTransient(err)) return wait(key);
        return refuse(key, err);
      }
    }

    // 2. The message, before any bytes: everyone sees it now.
    send = find(key);
    if (!send) return;
    try {
      const message = await chatApi.sendFiles(send.conversationId, {
        attachmentIds: send.files.map((f) => f.attachmentId!),
        caption: send.caption ?? undefined,
        clientId: send.key,
        replyToId: send.replyTo?.id,
      });
      if (queryClient) {
        // Into the thread before the local row goes, so there is no gap.
        insertThreadMessage(queryClient, send.conversationId, message);
        invalidateConversationRows(queryClient);
      }
      update(key, { messageId: message.id, stage: 'sent' });
    } catch (err) {
      if (!find(key)) return;
      if (isTransient(err)) return wait(key);
      return refuse(key, err);
    }
  }

  // 3. The bytes, one file at a time, so on a weak line each photo arrives
  // whole rather than all of them arriving late together.
  send = find(key);
  if (!send?.messageId) return;
  const { conversationId, messageId } = send;
  for (const upload of send.files) {
    if (upload.status === 'done' || upload.status === 'failed' || !upload.attachmentId) continue;
    const localId = upload.file.localId;
    const resume = upload.tried;
    if (offline()) {
      updateFile(key, localId, { status: 'waiting' });
      return wait(key);
    }
    updateFile(key, localId, { status: 'uploading', progress: 0, tried: true, problem: null });
    let shown = 0;
    try {
      const attachment = await deliverChatFile({
        conversationId,
        attachmentId: upload.attachmentId,
        ticket: upload.ticket,
        resume,
        put: (ticket) =>
          putToBucket(asFile(upload.file), ticket, (fraction) => {
            // Every few percent, not every packet.
            if (fraction - shown < 0.04 && fraction < 1) return;
            shown = fraction;
            updateFile(key, localId, { progress: fraction });
          }),
      });
      retryDelay = 4000;
      updateFile(key, localId, { status: 'done', progress: 1 });
      patchAttachment(conversationId, messageId, attachment);
    } catch (err) {
      if (!find(key)) return;
      if (isTransient(err)) {
        // This one and the ones behind it wait together, and say so.
        sends = sends.map((s) =>
          s.key === key
            ? {
                ...s,
                files: s.files.map((f) =>
                  f.status === 'uploading' || f.status === 'queued' ? { ...f, status: 'waiting' } : f,
                ),
              }
            : s,
        );
        emit();
        return wait(key);
      }
      updateFile(key, localId, { status: 'failed', problem: refusalWords(err) });
    }
  }
}

// ─── What the thread calls ───────────────────────────────────────────────────

/**
 * Sends photos or a PDF: shown in the thread at once from this computer's
 * copies, then words first, then the bytes.
 */
export function startFilesSend(
  client: QueryClient,
  input: {
    conversationId: string;
    kind: FilesSend['kind'];
    files: PreparedFile[];
    caption: string | null;
    replyTo: FilesSend['replyTo'];
  },
): string {
  queryClient = client;
  listen();
  const key = newClientId();
  sends = [
    ...sends,
    {
      key,
      conversationId: input.conversationId,
      kind: input.kind,
      caption: input.caption,
      replyTo: input.replyTo,
      files: input.files.map((file) => ({
        file,
        attachmentId: null,
        ticket: null,
        status: 'queued',
        progress: 0,
        tried: false,
        problem: null,
      })),
      messageId: null,
      stage: 'sending',
      problem: null,
      storageFull: false,
      createdAt: new Date().toISOString(),
    },
  ];
  emit();
  void run(key);
  return key;
}

/**
 * Sends a voice note recorded here: in the thread at once, playable from
 * this computer's copy, then words first — the message, with its note still
 * arriving — then the bytes. No caption; the reply it answers goes with it.
 */
export function startVoiceSend(
  client: QueryClient,
  input: {
    conversationId: string;
    take: { blob: Blob; mimeType: string; durationMs: number };
    replyTo: FilesSend['replyTo'];
  },
): string {
  return startFilesSend(client, {
    conversationId: input.conversationId,
    kind: 'voice',
    files: [prepareVoice(input.take)],
    caption: null,
    replyTo: input.replyTo,
  });
}

/** Tries again now: a send refused before it went, or a file that stopped. */
export function retryFilesSend(key: string): void {
  const send = find(key);
  if (!send) return;
  sends = sends.map((s) =>
    s.key === key
      ? {
          ...s,
          stage: s.messageId ? 'sent' : 'sending',
          problem: null,
          files: s.files.map((f) =>
            f.status === 'failed' || f.status === 'waiting' ? { ...f, status: 'queued', problem: null } : f,
          ),
        }
      : s,
  );
  emit();
  void run(key);
}

/** Tries one attachment again, by the server's id or this computer's: "Didn't send · Click to retry". */
export function retryUpload(id: string): void {
  const send = sends.find((s) => s.files.some((f) => f.attachmentId === id || f.file.localId === id));
  if (send) retryFilesSend(send.key);
}

/** Takes a send that never became a message off this computer. */
export function discardFilesSend(key: string): void {
  const send = find(key);
  if (!send || send.messageId) return;
  send.files.forEach((f) => releasePreview(f.file));
  sends = sends.filter((s) => s.key !== key);
  emit();
}
