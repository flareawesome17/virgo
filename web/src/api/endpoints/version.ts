import { api } from '../client';

/**
 * The release the API is running.
 *
 * `version` is baked into the API image by the release workflow from the
 * GitHub tag it checked out, so it cannot disagree with the code serving it.
 * `null` means the API was not built by that workflow — a local or ad-hoc
 * build, which is not a release and should not be labelled as one.
 */
export interface ServerVersion {
  version: string | null;
  commit: string | null;
}

export const versionApi = {
  get(): Promise<ServerVersion> {
    return api.get<ServerVersion>('/version');
  },
};
