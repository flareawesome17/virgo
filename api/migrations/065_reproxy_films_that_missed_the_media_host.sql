-- Films that were processed before the media host was configured.
--
-- `createProxy` opened with this:
--
--     if (!this.mediaLink.isConfigured) return null;
--
-- No log line, no thrown error, no failure. The film was marked `ready` with
-- `proxy_key` null, and a null proxy is not a failure — so the queue never
-- looked at it again. Every one of those films still plays only as whatever
-- came off the camera, which for HEVC or 10-bit footage means it does not
-- play in a browser at all:
--
--     This video cannot play in this browser
--
-- Migration 060 already re-queued films with no proxy, but it ran at the
-- deploy that introduced the column — on a host where MEDIA_HOST was not yet
-- set. Every film it re-queued hit the same silent return and came back out
-- `ready` with nothing to show for it. This is that migration again, now that
-- the host is configured, which is the state 060 assumed and did not have.
--
-- **Excludes images rather than requiring films.** 060 asked for
-- `content_type like 'video/%'`, which is only correct if every film actually
-- carries a `video/*` type — and a file's stored type comes from whatever the
-- client sent at upload, which is not something to bet a repair on. A film
-- stored as `application/octet-stream` would be skipped by that predicate and
-- stay unplayable, with nothing to indicate why.
--
-- Anything re-queued that turns out not to need a proxy costs one ffprobe:
-- MediaProcessingService now decides from the codec, so a still gets its
-- dimensions and nothing else, and an audio file has no video stream to act
-- on. That is the cheap side of the trade. The expensive side is a film that
-- never plays.
--
-- `pending` is deliberately excluded. A file already queued does not need
-- queueing twice, and resetting its attempt count would hide a job that is
-- genuinely failing.
update user_files
   set processing_status = 'pending',
       next_processing_at = now(),
       processing_attempts = 0
 where proxy_key is null
   and processing_status in ('ready', 'failed')
   and split_part(coalesce(content_type, ''), '/', 1) <> 'image';
