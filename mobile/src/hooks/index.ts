/**
 * Hooks
 *
 * Data hooks wrap the typed endpoint modules in `src/api` with React Query.
 * Screens should use these rather than calling the API modules directly.
 */

export { useAuth, AuthError, authKeys, type User } from '@/src/hooks/useAuth'
export { useOffline } from '@/src/hooks/useOffline'
export { useTheme } from '@/src/providers/ThemeProvider'

// ─── Resource hooks ──────────────────────────────────────────────────────────

export {
  useWorkspaces,
  useWorkspace,
  useCreateWorkspace,
  useUpdateWorkspace,
  useDeleteWorkspace,
} from '@/src/hooks/useWorkspaces'

export {
  useAlbums,
  useAlbum,
  useCreateAlbum,
  useUpdateAlbum,
  useDeleteAlbum,
} from '@/src/hooks/useAlbums'

export {
  useScheduleEvents,
  useScheduleEventRange,
  useScheduleEvent,
  useCreateScheduleEvent,
  useUpdateScheduleEvent,
  useDeleteScheduleEvent,
  useEventInvitations,
  useEventAttendees,
  useInviteToEvent,
  useUninviteFromEvent,
  useRespondToEventInvitation,
} from '@/src/hooks/useScheduleEvents'

export {
  useCollaborators,
  useCollaborator,
  useCreateCollaborator,
  useUpdateCollaborator,
  useDeleteCollaborator,
} from '@/src/hooks/useCollaborators'
export {
  useCollaboratorInvitations,
  useRespondToInvitation,
  useSetCollaboratorAlbums,
  useCollaboratorAlbums,
} from '@/src/hooks/useCollaborators'

export {
  useReminders,
  useReminder,
  useCreateReminder,
  useUpdateReminder,
  useDeleteReminder,
} from '@/src/hooks/useReminders'

export {
  useFriends,
  useFriendPresence,
  useIncomingFriendRequests,
  useFriend,
  useCreateFriend,
  useUpdateFriend,
  useDeleteFriend,
  useSendFriendRequest,
  useRespondToFriendRequest,
  usePeopleSearch,
} from '@/src/hooks/useFriends'

export { useUpload, useDeleteUpload, type UploadInput } from '@/src/hooks/useUpload'
export { useUsage, usePlans, usageQueryKey, plansQueryKey } from '@/src/hooks/useUsage'
export { useAlbumFiles, albumFilesQueryKey, kindOf, fileNameFromKey, fileDate, type MediaKind } from '@/src/hooks/useAlbumFiles'

export {
  useStorageBreakdown,
  useUnassignedFiles,
  useAttachToAlbum,
  useWipeStorage,
  storageBreakdownKey,
  unassignedFilesKey,
} from '@/src/hooks/useStorageAdmin'

export { useReminderNotifications, usePushRegistration } from '@/src/hooks/useReminderNotifications'

export { usePlanLimits } from '@/src/hooks/usePlanLimits'

export {
  useConversations,
  useConversation,
  useMuteConversation,
  useRenameConversation,
  useAddConversationMember,
  useDeleteConversation,
  useUnreadCount,
  useThread,
  useParticipants,
  useSendMessage,
  useDeleteMessage,
  useOpenDirectChat,
  useCreateGroupChat,
  useMarkThreadRead,
  useLeaveConversation,
  useMessageAlerts,
  setOpenConversation,
  getOpenConversation,
  chatKeys,
} from '@/src/hooks/useChat'

export { useNotificationRouting } from '@/src/hooks/useNotificationRouting'
export { useRealtime } from '@/src/hooks/useRealtime'
export { useRoles } from '@/src/hooks/useRoles'

export {
  useLocationSharing,
  useShareLocation,
  useStopSharingLocation,
  useNearbyPeople,
  useNearbyRoleCounts,
} from '@/src/hooks/useNearby'

export {
  useBilling,
  useSubscribe,
  useCancelSubscription,
  useRefreshBilling,
  useSettlePendingCheckout,
} from '@/src/hooks/useBilling'

export {
  useHireEnquiries,
  useSendEnquiry,
  useAnswerEnquiry,
} from '@/src/hooks/useHire'

export {
  useProfileSettings,
  useSetHandle,
  useSetPublished,
  usePortfolio,
  usePortfolioActions,
} from '@/src/hooks/useProfile'

export {
  useJobs,
  useJob,
  useMyJobs,
  useApplicants,
  useMyApplications,
  useCreateJob,
  usePendingApplicants,
  useUpdateJob,
  useSetJobStatus,
  useDeleteJob,
  useApplyToJob,
  useRespondToApplication,
  useReportJob,
  useUnseenJobs,
  useMarkJobsSeen,
} from '@/src/hooks/useJobs'

export {
  useNotifications,
  useUnreadNotifications,
  useMarkNotificationsRead,
} from './useNotifications';

export {
  useSupportTickets,
  useSupportThread,
  useOpenTicket,
  useReplyToTicket,
} from './useSupport';

export {
  useBookings,
  useBooking,
  useUpdateBooking,
  useConfirmBooking,
  useCancelBooking,
} from './useBookings';

export {
  usePromoOffers,
  useReferralCode,
  useClaimPromo,
} from './usePromos';
