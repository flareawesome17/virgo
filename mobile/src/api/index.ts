/**
 * API layer.
 *
 * One typed module per resource, each mapping directly onto the NestJS
 * endpoints in `api/`. Screens go through the hooks in `src/hooks`, which wrap
 * these with React Query; call these directly only outside a component.
 */

export { api, request, setAuthFailureHandler } from './client';
export { ApiError } from './errors';
export { API_BASE_URL } from './config';
export {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  hydrateTokens,
  setTokens,
} from './tokens';
export { queryKeys } from './queryKeys';

export { authApi, type Credentials } from './endpoints/auth';
export {
  workspacesApi,
  type CreateWorkspaceInput,
  type UpdateWorkspaceInput,
} from './endpoints/workspaces';
export {
  albumsApi,
  type CreateAlbumInput,
  type ListAlbumsParams,
  type UpdateAlbumInput,
} from './endpoints/albums';
export {
  scheduleEventsApi,
  type CreateScheduleEventInput,
  type ListScheduleEventsParams,
  type UpdateScheduleEventInput,
} from './endpoints/scheduleEvents';
export {
  collaboratorsApi,
  type CreateCollaboratorInput,
  type ListCollaboratorsParams,
  type UpdateCollaboratorInput,
} from './endpoints/collaborators';
export {
  remindersApi,
  type CreateReminderInput,
  type ListRemindersParams,
  type UpdateReminderInput,
} from './endpoints/reminders';
export {
  friendsApi,
  type CreateFriendInput,
  type ListFriendsParams,
  type UpdateFriendInput,
} from './endpoints/friends';
export { servicesApi, type ChatMessage } from './endpoints/services';
export { usageApi, formatBytes, toGB, type UsageSummary } from './endpoints/usage';
export {
  storageApi,
  contentTypeForAsset,
  type UploadResult,
  type UploadScope,
  type UploadTicket,
  type StoredFile,
  type StorageBreakdown,
  type WipeResult,
} from './endpoints/storage';

export {
  albumShareApi,
  ALL_SHARE_KINDS,
  type ShareLink,
  type ShareMediaKind,
} from './endpoints/albumShare';

export type * from './types';
