import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi, queryKeys, type TwoFactorStatus } from '@/api';

export const twoFactorKey = ['auth', 'two-factor'] as const;

export function useTwoFactorStatus(enabled = true) {
  return useQuery({
    queryKey: twoFactorKey,
    queryFn: () => authApi.twoFactorStatus(),
    enabled,
  });
}

export function useBeginTwoFactorSetup() {
  return useMutation({ mutationFn: (password: string) => authApi.beginTwoFactorSetup(password) });
}

export function useConfirmTwoFactorSetup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ challengeToken, code }: { challengeToken: string; code: string }) =>
      authApi.confirmTwoFactorSetup(challengeToken, code),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.auth.session, result.user);
      queryClient.setQueryData(twoFactorKey, {
        enabled: true,
        enabledAt: new Date().toISOString(),
        recoveryCodesRemaining: result.recoveryCodes.length,
        email: result.user.email,
      });
    },
  });
}

export function useResendTwoFactorCode() {
  return useMutation({
    mutationFn: (challengeToken: string) =>
      authApi.resendTwoFactorCode(challengeToken),
  });
}

export function useBeginTwoFactorSecurityAction() {
  return useMutation({
    mutationFn: ({
      password,
      action,
    }: {
      password: string;
      action: 'disable' | 'recovery';
    }) => authApi.beginTwoFactorSecurityAction(password, action),
  });
}

export function useDisableTwoFactor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ challengeToken, code }: { challengeToken: string; code: string }) =>
      authApi.disableTwoFactor(challengeToken, code),
    onSuccess: () => {
      queryClient.setQueryData(queryKeys.auth.session, null);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
    },
  });
}

export function useRegenerateTwoFactorRecoveryCodes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ challengeToken, code }: { challengeToken: string; code: string }) =>
      authApi.regenerateTwoFactorRecoveryCodes(challengeToken, code),
    onSuccess: (result) => {
      // Patch the cached status rather than refetch it — the count is the
      // only thing replacing the codes changes. An empty cache is left empty
      // on purpose: spreading nothing produced a status with no email and no
      // enabledAt, which read as a real one. The next read fetches it whole.
      queryClient.setQueryData<TwoFactorStatus>(twoFactorKey, (previous) =>
        previous
          ? {
              ...previous,
              enabled: true,
              recoveryCodesRemaining: result.recoveryCodes.length,
            }
          : previous,
      );
    },
  });
}
