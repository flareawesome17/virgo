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
  useUnreadCount,
  useThread,
  useParticipants,
  useSendMessage,
  useOpenDirectChat,
  useCreateGroupChat,
  useMarkThreadRead,
  useLeaveConversation,
  chatKeys,
} from '@/src/hooks/useChat'

export {
  useLocationSharing,
  useShareLocation,
  useStopSharingLocation,
  useNearbyPeople,
} from '@/src/hooks/useNearby'
