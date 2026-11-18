import {
  chatApi,
  uploadTicketExpired,
  type ChatAttachment,
  type ChatUploadTicket,
} from './endpoints/chat';
import { isNotUploaded } from './errors';

/**
 * Getting one chat photo or file from the device to "ready" (phase 4).
 *
 * The same steps on both apps; only the PUT differs (a file URI on the phone,
 * a Blob on the web), so the caller passes it in. The message itself has
 * already been sent by then (`chatApi.sendFiles`): the words go first on a
 * weak signal, and each photo fills in as it lands.
 *
 * - A fresh upload PUTs, then finishes.
 * - A resumed one (the app was closed, or the line dropped for long) asks to
 *   finish first: the bytes may have landed before it stopped. Only if they
 *   hadn't (409 NOT_UPLOADED) does it PUT again, with a fresh link when the
 *   old one has lapsed.
 *
 * Throws what the caller should show: a refusal from finish (it could not be
 * read), or the PUT's own failure (no connection), which the caller keeps
 * and tries again later.
 */
export async function deliverChatFile(options: {
  conversationId: string;
  attachmentId: string;
  /** The ticket from createUploads, if it is still at hand. */
  ticket?: ChatUploadTicket | null;
  /** True when picking up an upload that may already have landed. */
  resume?: boolean;
  /** Sends the bytes to `ticket.uploadUrl` with `ticket.requiredHeaders`. Throws on failure. */
  put: (ticket: ChatUploadTicket) => Promise<void>;
}): Promise<ChatAttachment> {
  const { conversationId, attachmentId, put } = options;

  if (options.resume) {
    try {
      return await chatApi.finishUpload(conversationId, attachmentId);
    } catch (err) {
      if (!isNotUploaded(err)) throw err;
    }
  }

  let ticket =
    options.ticket && !uploadTicketExpired(options.ticket)
      ? options.ticket
      : await chatApi.resignUpload(conversationId, attachmentId);
  try {
    await put(ticket);
  } catch (err) {
    // A link that lapsed while the PUT was waiting for a connection: ask for
    // a fresh one, and try once more. Anything else is the caller's to retry.
    if (!uploadTicketExpired(ticket)) throw err;
    ticket = await chatApi.resignUpload(conversationId, attachmentId);
    await put(ticket);
  }
  return chatApi.finishUpload(conversationId, attachmentId);
}
