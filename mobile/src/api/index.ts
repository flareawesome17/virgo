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

export {
  authApi,
  type Credentials,
  type SignupProfile,
} from './endpoints/auth';
export {
  bookingsApi,
  rateLabel,
  type Booking,
  type BookingPatch,
  type BookingSide,
} from './endpoints/bookings';
export {
  promosApi,
  expiryLabel,
  rewardLabel,
  storageLabel,
  type ClaimedPromo,
  type OfferedPromo,
  type PromoKind,
  type ReferralResult,
} from './endpoints/promos';
export {
  notificationsApi,
  type AppNotification,
  type NotificationTopic,
} from './endpoints/notifications';
export {
  supportApi,
  type SupportTicket,
  type SupportMessage,
  type TicketStatus,
} from './endpoints/support';
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
  type AlbumGrant,
  type CollaboratorInvitation,
  type CreateCollaboratorInput,
  type MediaAccess,
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
export {
  profilesApi,
  portfolioApi,
  profileUrl,
  titleFromRoles,
  type PublicProfile,
  type ProfileSettings,
  type PortfolioItem,
  type PortfolioImage,
  type PortfolioAlbum,
} from './endpoints/profiles';
export {
  hireApi,
  type HireEnquiry,
  type SendEnquiryInput,
} from './endpoints/hire';
export {
  jobsApi,
  jobUrl,
  budgetLabel,
  roleBudgetLabel,
  applicationFor,
  rolesLeftFor,
  openRolesOf,
  isRoleFilled,
  headlineApplication,
  type JobPost,
  type JobApplication,
  type CreateJobInput,
  type ListJobsParams,
  type ReportReason,
  type JobApplicationStatus,
  type MyApplication,
  type RoleBudget,
  distanceLabel,
} from './endpoints/jobs';
export {
  billingApi,
  type BillingStatus,
  type StartedCheckout,
  type SubscriptionStatus,
} from './endpoints/billing';
export {
  usageApi,
  formatBytes,
  formatMoney,
  planPrice,
  planCurrency,
  toGB,
  type UsageSummary,
  type PlanInfo,
} from './endpoints/usage';
export {
  storageApi,
  contentTypeForAsset,
  displaySrcSet,
  largestDisplaySource,
  type UploadResult,
  type UploadScope,
  type UploadTicket,
  type StoredFile,
  type StoredMediaKind,
  type StoredFilesPage,
  type StorageBreakdown,
  type WipeResult,
  type FileOrder,
  MAX_UPLOAD_BYTES,
} from './endpoints/storage';

export {
  albumShareApi,
  ALL_SHARE_KINDS,
  type ShareLink,
  type ShareMediaKind,
} from './endpoints/albumShare';

export {
  albumSectionsApi,
  type AlbumSection,
  type AlbumSectionList,
  type KindCounts,
} from './endpoints/albumSections';

export {
  chatApi,
  type Conversation,
  // Not 'ChatMessage': the AI proxy that owned that name was removed with
  // the services module. Renaming it now would touch every chat screen on
  // both clients for no gain, so the name stands.
  type ConversationMessage,
  type JobAcceptedContext,
  type Participant,
  type Thread,
  type SendMessageInput,
} from './endpoints/chat';
export { versionApi, type ServerVersion } from './endpoints/version';
export { discoverApi, type NearbyPerson, type LocationStatus } from './endpoints/discover';

export type * from './types';
