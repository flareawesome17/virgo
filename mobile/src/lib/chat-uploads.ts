import { useEffect, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system/legacy';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  ApiError,
  chatApi,
  chatRefusal,
  deliverChatFile,
  isStorageFull,
  putFileToBucket,
  type ChatAttachment,
  type ChatUploadTicket,
} from '@/src/api';
import { chatKeys, insertThreadMessage, patchThreadMessages } from '@/src/hooks/useChat';
import { filesKeys } from '@/src/hooks/useChatFiles';
import { usageQueryKey } from '@/src/hooks/useUsage';
import { dropChatFile, type LocalChatFile } from '@/src/lib/chat-files';
import { newClientId } from '@/src/lib/outbox';

/**
 * Photos and files on their way out of this phone (phase 4), kept until the
 * server has every byte.
 *
 * Words first (weak-signal rule 4): the upload links are asked for, then the
 * message is sent with every attachment still "uploading", so everyone sees it
 * at once, and only then do the bytes go, one file at a time, each filling in
 * for both sides as it lands. A dropped connection leaves the rest waiting
 * here, said as "Waiting for a connection", and they carry on when it comes
 * back — or on the next launch, since the queue is written down, with the
 * copies in the app's documents folder (chat-files.ts).
 *
 * Its own queue rather than the message outbox's: an outbox item is one
 * request, and this is three kinds of request with a file behind each.
 */

/** Where one file has got. */
export type UploadFileState = 'queued' | 'uploading' | 'waiting' | 'done' | 'failed';

export interface UploadFile extends LocalChatFile {
  /** The attachment, once the links are made. */
  attachmentId: string | null;
  state: UploadFileState;
  /** 0–1 while uploading. Not worth keeping across launches. */
  progress: number;
  tries: number;
}

/**
 * - sending: on its way, or about to be.
 * - waiting: the network failed it; tried again when the connection is back.
 * - failed: the server said no before the message went (out of storage, or
 *   a refusal), so nothing was sent. Tried again only by a tap.
 */
export type UploadJobStatus = 'sending' | 'waiting' | 'failed';

export interface UploadJob {
  /** The message's client id, kept across retries: the server stores it once. */
  clientId: string;
  conversationId: string;
  kind: 'photos' | 'file' | 'voice';
  caption: string | null;
  replyToId?: string;
  replyToSender?: string | null;
  replyToLine?: string | null;
  files: UploadFile[];
  /** Set once the message is in the chat. */
  messageId: string | null;
  status: UploadJobStatus;
  /** Why it failed: 'storage-full' gets its own words and a way to Storage. */
  failure: 'storage-full' | 'refused' | null;
  /** The server's own sentence for a refusal, never raw JSON. */
  failureText: string | null;
  createdAt: string;
  attempts: number;
}

const EMPTY: readonly UploadJob[] = [];

let owner: string | null = null;
let jobs: UploadJob[] = [];
let byConversation = new Map<string, readonly UploadJob[]>();
const listeners = new Set<() => void>();
/** Upload links from this session, by attachment: a relaunch asks for fresh ones. */
const tickets = new Map<string, ChatUploadTicket>();

const storageKey = (userId: string) => `virgo.chat-uploads.v1:${userId}`;

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function save(): void {
  const userId = owner;
  if (!userId) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const value = jobs.length > 0 ? JSON.stringify(jobs) : null;
    const write = value
      ? AsyncStorage.setItem(storageKey(userId), value)
      : AsyncStorage.removeItem(storageKey(userId));
    write.catch(() => {
      // Storage full or unavailable: the queue still works for this session.
    });
  }, 250);
}

function publish(next: UploadJob[], persist = true): void {
  jobs = next;
  const grouped = new Map<string, UploadJob[]>();
  for (const job of jobs) {
    const list = grouped.get(job.conversationId);
    if (list) list.push(job);
    else grouped.set(job.conversationId, [job]);
  }
  byConversation = grouped;
  if (persist) save();
  for (const listener of listeners) listener();
}

function patchJob(clientId: string, patch: (job: UploadJob) => UploadJob, persist = true): void {
  if (!jobs.some((j) => j.clientId === clientId)) return;
  publish(
    jobs.map((j) => (j.clientId === clientId ? patch(j) : j)),
    persist,
  );
}

function patchFile(clientId: string, index: number, patch: Partial<UploadFile>, persist = true): void {
  patchJob(
    clientId,
    (j) => ({ ...j, files: j.files.map((f, i) => (i === index ? { ...f, ...patch } : f)) }),
    persist,
  );
}

function findJob(clientId: string): UploadJob | undefined {
  return jobs.find((j) => j.clientId === clientId);
}

/** Takes a job off the queue and throws its copies away. */
function removeJob(clientId: string): void {
  const job = findJob(clientId);
  if (!job) return;
  publish(jobs.filter((j) => j.clientId !== clientId));
  for (const file of job.files) {
    if (file.attachmentId) tickets.delete(file.attachmentId);
    void dropChatFile(file.uri);
  }
}

/**
 * Loads the signed-in person's queue from the last session. Anything that
 * was mid-flight is waiting: whether its bytes got there is unknown, and
 * finishing it again is safe (deliverChatFile asks first, with `resume`).
 */
async function loadUploads(userId: string): Promise<void> {
  if (owner === userId) return;
  owner = userId;
  let stored: UploadJob[] = [];
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (raw) stored = JSON.parse(raw) as UploadJob[];
  } catch {
    stored = [];
  }
  if (owner !== userId) return;
  const restored = stored
    .filter((j) => j && typeof j.clientId === 'string' && Array.isArray(j.files))
    .map((j): UploadJob => ({
      ...j,
      status: j.status === 'sending' ? 'waiting' : j.status,
      files: j.files.map((f) => ({
        ...f,
        progress: 0,
        state: f.state === 'uploading' ? 'waiting' : f.state,
      })),
    }));
  const known = new Set(restored.map((j) => j.clientId));
  publish([...restored, ...jobs.filter((j) => !known.has(j.clientId))]);
}

/** Signing out takes the queue with it, and the copies. */
function resetUploads(): void {
  const userId = owner;
  const gone = jobs;
  owner = null;
  clearTimeout(saveTimer);
  jobs = [];
  byConversation = new Map();
  tickets.clear();
  for (const listener of listeners) listener();
  for (const job of gone) for (const file of job.files) void dropChatFile(file.uri);
  if (userId) AsyncStorage.removeItem(storageKey(userId)).catch(() => undefined);
}

// ─── Failures the screen should hear about ────────────────────────────────────

export interface UploadFailure {
  conversationId: string;
  clientId: string;
  failure: 'storage-full' | 'refused';
  text: string | null;
}

const failureListeners = new Set<(failure: UploadFailure) => void>();

/** Hears when a send is refused before it went: out of storage, or another no. */
export function onUploadFailure(listener: (failure: UploadFailure) => void): () => void {
  failureListeners.add(listener);
  return () => failureListeners.delete(listener);
}

// ─── Sending ──────────────────────────────────────────────────────────────────

/** A failure worth trying again by itself: no answer, or the server falling over. */
function isTransient(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true;
  return err.status === 0 || err.status === 408 || err.status === 429 || err.status >= 500;
}

/** The server's sentence, when it is one meant for a person. */
function refusalText(err: unknown): string | null {
  if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.message) return err.message;
  return null;
}

/**
 * Sends a file's bytes to its signed link.
 *
 * On a phone, streamed from disk by the native uploader (putFileToBucket,
 * which leaves Content-Length to it: set by hand as well, Android's OkHttp
 * held the request forever). On the Expo web preview there is no uploader,
 * so the blob goes by XHR, which reports progress.
 */
async function putLocal(
  uri: string,
  ticket: ChatUploadTicket,
  onProgress: (fraction: number) => void,
): Promise<void> {
  if (Platform.OS !== 'web') {
    // The copy is gone (the app's data was cleared): no retry brings it back.
    const info = await FileSystem.getInfoAsync(uri).catch(() => null);
    if (info && !info.exists) throw new ApiError(410, 'The copy on this phone is gone.');
    await putFileToBucket(uri, ticket, onProgress);
    return;
  }
  // A blob of this page's: gone once the page has been reloaded.
  const blob = await fetch(uri)
    .then((r) => r.blob())
    .catch(() => {
      throw new ApiError(410, 'The copy on this device is gone.');
    });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', ticket.uploadUrl);
    for (const [name, value] of Object.entries(ticket.requiredHeaders)) {
      // The browser sets the length itself, and refuses to be told.
      if (name.toLowerCase() !== 'content-length') xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(Math.min(e.loaded / e.total, 1));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new ApiError(xhr.status, 'Upload failed. Please try again.'));
    xhr.onerror = () => reject(new ApiError(0, 'No connection.'));
    xhr.send(blob);
  });
}

/** A finished attachment, into the cached message: the socket says the same, but may be down. */
function applyAttachment(
  queryClient: QueryClient,
  conversationId: string,
  messageId: string,
  attachment: ChatAttachment,
): void {
  patchThreadMessages(queryClient, conversationId, (m) =>
    m.id === messageId && m.attachments
      ? { ...m, attachments: m.attachments.map((a) => (a.id === attachment.id ? attachment : a)) }
      : m,
  );
}

function markAttachmentFailed(
  queryClient: QueryClient,
  conversationId: string,
  messageId: string,
  attachmentId: string,
): void {
  patchThreadMessages(queryClient, conversationId, (m) =>
    m.id === messageId && m.attachments
      ? {
          ...m,
          attachments: m.attachments.map((a) =>
            a.id === attachmentId ? { ...a, status: 'failed' as const } : a,
          ),
        }
      : m,
  );
}

/** A job refused before its message went: kept, said, and tried again only by a tap. */
function refuse(queryClient: QueryClient, job: UploadJob, err: unknown): true {
  const storage = isStorageFull(err);
  // The storage figures on this phone said it would fit: they are out of date.
  if (storage) void queryClient.invalidateQueries({ queryKey: usageQueryKey });
  const failure = storage ? 'storage-full' : 'refused';
  const text = storage ? null : refusalText(err);
  patchJob(job.clientId, (j) => ({ ...j, status: 'failed', failure, failureText: text }));
  for (const listener of failureListeners) {
    listener({ conversationId: job.conversationId, clientId: job.clientId, failure, text });
  }
  return true;
}

/**
 * One go at one job, as far as it will get. True when it is settled — sent
 * and uploaded, or refused — and false when the connection failed it.
 */
async function runJob(queryClient: QueryClient, clientId: string): Promise<boolean> {
  let job = findJob(clientId);
  if (!job) return true;
  patchJob(clientId, (j) => ({ ...j, status: 'sending', attempts: j.attempts + 1 }));

  // 1. The upload links. Each one's id is the attachment.
  if (job.files.some((f) => !f.attachmentId)) {
    try {
      const made = await chatApi.createUploads(
        job.conversationId,
        job.files.map((f) => ({
          contentType: f.contentType,
          contentLength: f.size,
          name: f.name,
          ...(f.durationMs ? { durationMs: Math.round(f.durationMs) } : {}),
        })),
      );
      for (const ticket of made) tickets.set(ticket.id, ticket);
      patchJob(clientId, (j) => ({
        ...j,
        files: j.files.map((f, i) => ({ ...f, attachmentId: made[i]?.id ?? f.attachmentId })),
      }));
    } catch (err) {
      if (isTransient(err)) {
        patchJob(clientId, (j) => ({ ...j, status: 'waiting' }));
        return false;
      }
      return refuse(queryClient, job, err);
    }
    job = findJob(clientId);
    if (!job) return true;
  }

  // 2. The message, before any bytes: everyone sees it now.
  if (!job.messageId) {
    const attachmentIds = job.files.map((f) => f.attachmentId).filter((id): id is string => !!id);
    try {
      const message = await chatApi.sendFiles(job.conversationId, {
        attachmentIds,
        caption: job.caption ?? undefined,
        clientId: job.clientId,
        replyToId: job.replyToId,
      });
      insertThreadMessage(queryClient, job.conversationId, message);
      void queryClient.invalidateQueries({ queryKey: chatKeys.allConversations });
      patchJob(clientId, (j) => ({ ...j, messageId: message.id }));
    } catch (err) {
      if (isTransient(err)) {
        patchJob(clientId, (j) => ({ ...j, status: 'waiting' }));
        return false;
      }
      if (chatRefusal(err)) {
        // The thread has frozen under it: the screen's refetch shows why.
        void queryClient.invalidateQueries({ queryKey: chatKeys.thread(job.conversationId) });
      }
      return refuse(queryClient, job, err);
    }
    job = findJob(clientId);
    if (!job) return true;
  }

  // 3. The bytes, a file at a time, each filling in as it lands.
  const messageId = job.messageId!;
  for (let index = 0; index < job.files.length; index++) {
    const file = findJob(clientId)?.files[index];
    if (!file || !file.attachmentId || file.state === 'done' || file.state === 'failed') continue;
    const attachmentId = file.attachmentId;
    const ticket = tickets.get(attachmentId) ?? null;
    patchFile(clientId, index, { state: 'uploading', progress: 0, tries: file.tries + 1 }, false);
    let shown = 0;
    try {
      const attachment = await deliverChatFile({
        conversationId: job.conversationId,
        attachmentId,
        ticket,
        // After a relaunch, or a try that may have got the bytes there.
        resume: !ticket || file.tries > 0,
        put: (t) =>
          putLocal(file.uri, t, (fraction) => {
            // A tenth at a time: every byte redrawing the bubble is wasted work.
            if (fraction - shown < 0.1 && fraction < 1) return;
            shown = fraction;
            patchFile(clientId, index, { progress: fraction }, false);
          }),
      });
      tickets.delete(attachmentId);
      // The message first, so the bubble never draws a copy about to go.
      applyAttachment(queryClient, job.conversationId, messageId, attachment);
      patchFile(clientId, index, { state: 'done', progress: 1 });
      void dropChatFile(file.uri);
    } catch (err) {
      // The bucket saying no to the link itself: a fresh one may do, a few times.
      const linkRefused = err instanceof ApiError && err.status === 403 && file.tries < 3;
      if (isTransient(err) || linkRefused) {
        // Not used again: the next try asks to finish first, then for a fresh link.
        tickets.delete(attachmentId);
        patchFile(clientId, index, { state: 'waiting', progress: 0 });
        patchJob(clientId, (j) => ({ ...j, status: 'waiting' }));
        return false;
      }
      if (err instanceof ApiError && err.status === 404) {
        // Unsent meanwhile, or swept: nothing left to finish.
        patchFile(clientId, index, { state: 'failed' });
        continue;
      }
      // Couldn't be read, or too big: the server has marked it, and so does this.
      patchFile(clientId, index, { state: 'failed' });
      markAttachmentFailed(queryClient, job.conversationId, messageId, attachmentId);
    }
  }

  // Every file is in, or can't be: the copies go, and the storage figures move.
  removeJob(clientId);
  void queryClient.invalidateQueries({ queryKey: usageQueryKey });
  void queryClient.invalidateQueries({ queryKey: filesKeys.usage });
  return true;
}

let flushing: Promise<void> | null = null;
let flushAgain = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Works through the queue, oldest first. A connection failure stops the run
 * (the next would fail the same way) and tries again on a backoff; coming
 * back online or to the app starts one straight away.
 */
export function flushUploads(queryClient: QueryClient): Promise<void> {
  if (flushing) {
    flushAgain = true;
    return flushing;
  }
  clearTimeout(retryTimer);
  flushing = (async () => {
    do {
      flushAgain = false;
      const queue = jobs
        .filter((j) => j.status !== 'failed')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      for (const job of queue) {
        const settled = await runJob(queryClient, job.clientId);
        if (!settled) {
          // The ones behind it wait with it, and say so.
          for (const behind of queue) {
            const now = findJob(behind.clientId);
            if (now && now.status === 'sending') patchJob(behind.clientId, (j) => ({ ...j, status: 'waiting' }));
          }
          const attempts = findJob(job.clientId)?.attempts ?? 1;
          retryTimer = setTimeout(
            () => void flushUploads(queryClient),
            Math.min(2000 * 2 ** Math.min(attempts, 5), 60_000),
          );
          return;
        }
      }
    } while (flushAgain);
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/**
 * Queues photos (or one PDF) for a chat and starts sending. The files must
 * already be in the app's own folder (keepChatFile).
 */
export function queueChatFiles(
  queryClient: QueryClient,
  input: {
    conversationId: string;
    kind: 'photos' | 'file' | 'voice';
    files: LocalChatFile[];
    caption: string | null;
    replyToId?: string;
    replyToSender?: string | null;
    replyToLine?: string | null;
  },
): string {
  const clientId = newClientId();
  publish([
    ...jobs,
    {
      clientId,
      conversationId: input.conversationId,
      kind: input.kind,
      caption: input.caption,
      replyToId: input.replyToId,
      replyToSender: input.replyToSender ?? null,
      replyToLine: input.replyToLine ?? null,
      files: input.files.map((f) => ({ ...f, attachmentId: null, state: 'queued', progress: 0, tries: 0 })),
      messageId: null,
      status: 'sending',
      failure: null,
      failureText: null,
      createdAt: new Date().toISOString(),
      attempts: 0,
    },
  ]);
  void flushUploads(queryClient);
  return clientId;
}

/** A tap on a send that didn't go: once more, now. */
export function retryUpload(queryClient: QueryClient, clientId: string): void {
  patchJob(clientId, (j) => ({
    ...j,
    status: 'sending',
    failure: null,
    failureText: null,
    files: j.files.map((f) => (f.state === 'waiting' ? { ...f, state: 'queued' } : f)),
  }));
  void flushUploads(queryClient);
}

/** Gives up on a send that didn't go, and throws its copies away. */
export function discardUpload(clientId: string): void {
  removeJob(clientId);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** One chat's sends still on this phone, oldest first. */
export function useChatUploads(conversationId: string | undefined): readonly UploadJob[] {
  return useSyncExternalStore(
    subscribe,
    () => (conversationId ? (byConversation.get(conversationId) ?? EMPTY) : EMPTY),
    () => EMPTY,
  );
}

/**
 * Keeps the queue moving. Mounted once, with the session: loads what was left
 * last time and sends it whenever there is a connection again.
 */
export function useChatUploadSender(userId: string | undefined): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!userId) {
      resetUploads();
      return undefined;
    }
    void loadUploads(userId).then(() => flushUploads(queryClient));

    let wasOnline = true;
    const offNet = NetInfo.addEventListener((state) => {
      const online = !!state.isConnected && state.isInternetReachable !== false;
      if (online && !wasOnline) void flushUploads(queryClient);
      wasOnline = online;
    });
    const offApp = AppState.addEventListener('change', (state) => {
      if (state === 'active') void flushUploads(queryClient);
    });
    return () => {
      offNet();
      offApp.remove();
      clearTimeout(retryTimer);
    };
  }, [userId, queryClient]);
}
