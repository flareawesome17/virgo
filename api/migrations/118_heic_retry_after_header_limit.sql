-- Every HEIC is tried again, from its first attempt.
--
-- 117 started converting HEIC photos to JPEGs, and not one converted: sharp
-- read each file's header with libheif's default safety limits, which allow
-- 16 item references, and an iPhone photo's tile grid has 48 (12 MP) or 54
-- (48 MP). Every try ended at "Security limit exceeded: Number of references
-- in iref box (54) exceeds the security limits of 16 references", before
-- anything was decoded, and each was put off for longer (10 minutes, 40,
-- about 2.5 hours, about 10) towards being given up for good at five.
--
-- The header is now read without those limits (readHeicHeader in
-- thumbnails.service.ts). This clears the count, the wait and the error for
-- the files that failed that way, so the sweep takes them at once, newest
-- first, instead of after the wait or never.
--
-- Only those: a HEIC that failed for any other reason keeps its count.
-- Re-running it changes nothing more, and the image before this one ignores
-- the columns, so a rollback is unaffected.
set local lock_timeout = '5s';

update user_files
   set heic_attempts = 0,
       heic_next_at = null,
       heic_error = null
 where content_type in ('image/heic', 'image/heif')
   and converted_at is null
   and heic_error like '%Security limit exceeded%';
