import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  ApiError,
  authApi,
  portfolioApi,
  profilesApi,
  queryKeys,
  withProfileDefaults,
  type AuthUser,
  type PortfolioItem,
  type ProfileSettings,
  type UpdateProfileInput,
} from '@/api';

/**
 * Everything that shows a profile: your own page and settings, and every
 * public profile, your own among them.
 *
 * A handle, a publish, a cover or a switch changes what all of them say, and
 * refreshing only the screen that made the change left your own /u page and
 * the "Your profile" stats a step behind until the next focus.
 */
const invalidateProfiles = (queryClient: QueryClient) => {
  queryClient.invalidateQueries({ queryKey: queryKeys.profile.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.publicProfiles.all });
};

/** The caller's handle, publish state, and whatever is stopping them. */
export function useProfileSettings() {
  const query = useQuery({
    queryKey: queryKeys.profile.settings,
    queryFn: () => profilesApi.settings(),
  });

  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    settings: query.data as ProfileSettings | undefined,
  };
}

/**
 * Somebody's published profile, with every optional field settled.
 *
 * `select` runs on whatever the cache holds, a profile the previous release
 * persisted included, so a screen never meets a missing stats or viewer block.
 *
 * `notFound` holds even over cached data: a block or an unpublish has to take
 * the page away, not leave the copy from before it on screen.
 */
export function usePublicProfile(handle: string | undefined) {
  const query = useQuery({
    queryKey: queryKeys.publicProfiles.detail(handle ?? ''),
    queryFn: () => profilesApi.publicProfile(handle as string),
    enabled: Boolean(handle),
    // A 404 is an answer, and retrying one only delays saying so.
    retry: false,
    select: withProfileDefaults,
  });

  const notFound = query.error instanceof ApiError && query.error.status === 404;

  return {
    ...query,
    profile: query.data,
    notFound,
    /**
     * Failed or paused with nothing cached: a cached page stays up offline, as
     * the screen did before.
     */
    loadFailed: !query.data && ((query.isError && !notFound) || query.isPaused),
  };
}

/**
 * Your own page, published or not.
 *
 * A 404 is not retried: it is what an API from before this page answers, and
 * no number of retries changes that.
 */
export function useProfilePage() {
  const query = useQuery({
    queryKey: queryKeys.profile.page,
    queryFn: () => profilesApi.page(),
    retry: (failures, err) => !(err instanceof ApiError && err.status === 404) && failures < 2,
  });

  return {
    ...query,
    page: query.data,
    /**
     * Failed or paused with nothing cached: a cached page stays up offline, as
     * the screen did before.
     */
    loadFailed: !query.data && (query.isError || query.isPaused),
  };
}

export function useSetHandle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (handle: string) => profilesApi.setHandle(handle),
    onSuccess: () => invalidateProfiles(queryClient),
  });
}

export function useSetPublished() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (published: boolean) => profilesApi.setPublished(published),
    onSuccess: () => invalidateProfiles(queryClient),
  });
}

/**
 * Written into the session as well as refetched: the header on "Your profile"
 * reads the session, and it should change the moment the cover does.
 */
const writeCover = (queryClient: QueryClient, coverUrl: string | null) => {
  queryClient.setQueryData<AuthUser | null>(queryKeys.auth.session, (user) =>
    user ? { ...user, coverUrl } : user,
  );
  invalidateProfiles(queryClient);
};

/** Makes a confirmed 'covers' upload the cover, by its key. */
export function useSetCover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => profilesApi.setCover(key),
    onSuccess: ({ coverUrl }) => writeCover(queryClient, coverUrl),
  });
}

export function useRemoveCover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => profilesApi.removeCover(),
    onSuccess: () => writeCover(queryClient, null),
  });
}

/**
 * The profile switches, one key per request.
 *
 * Its own mutation rather than useAuth's updateProfile, so a switch saving
 * does not put the form's Save button into "Saving…" — and never part of the
 * form's body, because an older API refuses the unknown key with a 400 and
 * would take every other field down with it.
 */
export function useUpdateProfileFlags() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Pick<UpdateProfileInput, 'availableForBookings' | 'showStudio'>) =>
      authApi.updateMe(input),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.auth.session, updated);
      invalidateProfiles(queryClient);
    },
  });
}

export function usePortfolio() {
  const query = useQuery({
    queryKey: queryKeys.portfolio.all,
    queryFn: () => portfolioApi.list(),
  });

  const items = query.data?.data ?? ([] as PortfolioItem[]);

  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    items,
    images: items.filter((i) => i.kind === 'image'),
    albums: items.filter((i) => i.kind === 'album'),
  };
}

/**
 * Every portfolio mutation, sharing one cache write.
 *
 * The server answers each of them with the whole list, so the response is
 * written straight into the cache rather than triggering a refetch — the
 * editor is drag-and-drop and a round trip between drop and redraw shows.
 *
 * The pages that show the portfolio are refetched instead: their copy is the
 * public presentation, which the owner's list is not.
 */
export function usePortfolioActions() {
  const queryClient = useQueryClient();

  const apply = (result: { data: PortfolioItem[] }) => {
    queryClient.setQueryData(queryKeys.portfolio.all, {
      data: result.data,
      total: result.data.length,
    });
    queryClient.invalidateQueries({ queryKey: queryKeys.profile.page });
    queryClient.invalidateQueries({ queryKey: queryKeys.publicProfiles.all });
  };

  const addImage = useMutation({
    mutationFn: ({ fileKey, caption }: { fileKey: string; caption?: string }) =>
      portfolioApi.addImage(fileKey, caption),
    onSuccess: apply,
  });

  const addAlbum = useMutation({
    mutationFn: ({ albumId, caption }: { albumId: string; caption?: string }) =>
      portfolioApi.addAlbum(albumId, caption),
    onSuccess: apply,
  });

  const remove = useMutation({
    mutationFn: (id: string) => portfolioApi.remove(id),
    onSuccess: apply,
  });

  const reorder = useMutation({
    mutationFn: (ids: string[]) => portfolioApi.reorder(ids),
    onSuccess: apply,
  });

  return { addImage, addAlbum, remove, reorder };
}
