-- Adaptive-bitrate ladders for films.
--
-- 060 gave every film one web-playable copy at a fixed 2.5 Mbps. That fixed
-- the codec problem and most of the buffering, but it cannot adapt: a viewer
-- on mobile data with less than 2.5 Mbps still stalls, and one on fibre still
-- gets 720p. This is the rung set that lets the player choose.
--
-- `hls_prefix` is a DIRECTORY on the media volume, not a file and not a B2
-- object — a master playlist plus one subdirectory of fMP4 segments per rung.
-- Deletion is MediaLinkService's job, as a tree.
--
-- Its own queue columns rather than reusing `processing_status`, because the
-- two jobs run at different times for different reasons. Metadata and the
-- proxy happen on upload, for every film. A ladder happens when an album is
-- SHARED, for the films in it — most work is uploaded, delivered once and
-- never streamed again, and encoding three rungs for a film nobody opens is
-- the most expensive thing this system could do by accident.
alter table user_files
  add column if not exists hls_prefix text,
  add column if not exists hls_status text not null default 'none',
  add column if not exists hls_attempts integer not null default 0,
  add column if not exists hls_next_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_files_hls_status_check'
  ) then
    alter table user_files add constraint user_files_hls_status_check
      check (hls_status in ('none', 'pending', 'ready', 'failed'));
  end if;
end $$;

-- The claim query, which is the only thing that reads this at any volume.
create index if not exists user_files_hls_pending_idx
  on user_files (coalesce(hls_next_at, created_at), created_at)
  where hls_status = 'pending';

-- Films in albums that ALREADY have a live share link are the existing
-- library's version of "was shared", so they get queued once here. Everything
-- else waits until somebody shares it.
--
-- This is deliberately narrow. A broad requeue would put the entire back
-- catalogue through a three-rung encode at two jobs at a time, which on any
-- real library is days of saturated CPU on the machine also serving the app.
update user_files f
   set hls_status = 'pending',
       hls_next_at = now(),
       hls_attempts = 0
 where split_part(coalesce(f.content_type, ''), '/', 1) = 'video'
   and f.hls_status = 'none'
   and exists (
     select 1
       from album_share_links l
      where l.album_id = f.album_id
        and l.revoked_at is null
   );
