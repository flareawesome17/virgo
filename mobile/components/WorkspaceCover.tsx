import { View } from 'react-native';
import { FolderIcon } from 'lucide-react-native';
import { RemoteImage } from '@/components/RemoteImage';
import { useAlbums, useTheme } from '@/src/hooks';
import type { Workspace } from '@/src/api';
import { PALETTES } from '@/theme';

/**
 * A photograph to stand for a workspace: its chosen album's cover, or failing
 * that the newest album that has one. Null while loading and when there is
 * none.
 *
 * The workspace itself carries no picture, only which album was chosen, so
 * this asks for the workspace's albums — the same request the workspace makes
 * when opened, so the tap after it lands on a list already loaded.
 */
export function useWorkspaceCoverUrl(workspace: Workspace): string | null {
  const { albums } = useAlbums(
    { workspace_id: workspace.id, orderBy: 'created_at', direction: 'desc', limit: 100 },
    { enabled: workspace.album_count > 0 },
  );
  return (
    albums.find((a) => a.id === workspace.cover_album_id)?.cover_url ??
    albums.find((a) => a.cover_url)?.cover_url ??
    null
  );
}

/**
 * The picture that leads a workspace wherever it is listed.
 *
 * With no photograph yet it is a folder in the workspace's own colour, which
 * is still its colour everywhere else. It was a letter on a coloured square:
 * in an app for photographs, the one thing a list of work did not show was
 * the work.
 */
export function WorkspaceCover({
  workspace,
  width,
  height,
  radius = 14,
}: {
  workspace: Workspace;
  width: number;
  height: number;
  radius?: number;
}) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const cover = useWorkspaceCoverUrl(workspace);
  const accent = workspace.accent_color || palette.primary;

  return (
    <View
      className="overflow-hidden items-center justify-center"
      style={{ width, height, borderRadius: radius, backgroundColor: `${accent}26` }}
    >
      {cover ? (
        <RemoteImage source={{ uri: cover }} style={{ width, height }} contentFit="cover" />
      ) : (
        <FolderIcon size={Math.round(Math.min(width, height) * 0.34)} color={accent} />
      )}
    </View>
  );
}
