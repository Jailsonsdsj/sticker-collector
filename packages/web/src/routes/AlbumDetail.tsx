import { useParams } from "react-router";
import { AppHeader } from "../components/layout";
import { EmptyState, Skeleton } from "../components/ui";
import { useAlbum } from "../lib/queries";

/**
 * Placeholder for A-08.
 *
 * A-06 links every card here, because a grid of albums that cannot be opened is
 * a dead end and §5 says clicking an album — locked or unlocked — must show its
 * stickers. The grid, the rarity frames, the duplicate badges and the
 * missing-only toggle are A-08's; this only proves the route and the query
 * exist. Replace it wholesale.
 */
export function AlbumDetail() {
  const { id = "" } = useParams();
  const album = useAlbum(id);

  if (album.isLoading) return <Skeleton variant="block" />;

  return (
    <>
      <AppHeader title={album.data?.album.title ?? "Album"} />
      <EmptyState
        icon="◈"
        title={`${album.data?.album.owned ?? 0} of ${album.data?.album.total ?? 0} collected`}
        description="The sticker grid is built in A-08."
      />
    </>
  );
}
