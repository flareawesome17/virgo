-- Photographs that failed because they were treated as films.
--
-- ffprobe reports a JPEG as a video stream — a single mjpeg frame, whose
-- `codec_type` is `video` — so every uploaded image took the film path and had
-- a poster frame sought one second into it. There is no such second. ffmpeg
-- failed, the row retried three times, and the image was left `failed`:
--
--     Media processing failed for …/avatars/…jpg: Command failed:
--     ffmpeg -v error -ss 1.00 -i https://…
--
-- MediaProcessingService now decides from the declared content type rather
-- than from what ffprobe makes of the bytes. This re-queues what the old
-- behaviour left behind.
--
-- Nothing was lost by the failure — a photograph needs no poster and no proxy,
-- and the thumbnail is produced elsewhere. What these rows are missing is
-- `width_px` and `height_px`, which come from the probe and which the grid
-- uses to reserve the right space before an image loads. That is what this
-- gets back.
--
-- Scoped to images alone. A film sitting in `failed` failed for some other
-- reason, and re-queueing it here would hide that behind a retry.
update user_files
   set processing_status = 'pending',
       next_processing_at = now(),
       processing_attempts = 0
 where split_part(coalesce(content_type, ''), '/', 1) = 'image'
   and processing_status = 'failed';
