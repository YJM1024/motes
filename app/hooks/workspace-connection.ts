export type WorkspaceConnectionInput = {
  workspaceId: string | null; revealedWorkspaceId: string | null; sessionAvailable: boolean;
  sessionLoading: boolean; preferencesLoading: boolean; preferenceScope: string;
  loadedPreferenceScope: string | null; preferencesError: string;
};
/** A cached default is never presented as a confirmed preference or empty workspace. */
export function workspaceConnectionState(value: WorkspaceConnectionInput) {
  const ready = value.sessionAvailable && !value.sessionLoading && !value.preferencesLoading && !value.preferencesError && value.loadedPreferenceScope === value.preferenceScope;
  const retained = !!value.workspaceId && value.revealedWorkspaceId === value.workspaceId;
  const failure = !value.sessionLoading && (!value.sessionAvailable || !!value.preferencesError);
  return { ready, retained, phase: ready ? 'ready' as const : failure ? 'error' as const : 'restoring' as const,
    retryScope: !value.sessionAvailable ? 'session' as const : 'preferences' as const };
}
