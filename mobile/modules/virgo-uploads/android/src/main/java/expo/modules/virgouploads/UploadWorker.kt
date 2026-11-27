package expo.modules.virgouploads

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import okhttp3.Call
import okhttp3.MediaType
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okio.BufferedSink
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

/**
 * Background uploads on Android (docs/BACKGROUND_UPLOADS.md).
 *
 * expo-file-system sends an Android upload from inside the app's own process,
 * which Android freezes shortly after the app leaves the screen. This is a
 * WorkManager job instead, run as a foreground service of type dataSync with
 * a notification saying what it is doing: it keeps going off screen and, on
 * most phones, after the app is swiped away, and WorkManager starts it again
 * after a reboot or when the network returns.
 *
 * It works through UploadStore's queue three transfers at a time, streaming
 * each file, or each part's byte range, straight from disk.
 */
class UploadWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

  companion object {
    private const val WORK_NAME = "virgo-uploads"
    private const val CHANNEL_ID = "virgo-uploads"
    private const val NOTIFICATION_ID = 0x5649_5247
    private const val PARALLEL = 3
    /** Tries that got no answer before an item is reported failed. */
    private const val MAX_ATTEMPTS = 5

    /** Transfers in flight, by item id, so one can be stopped mid-way. */
    val calls = ConcurrentHashMap<String, Call>()

    private val client: OkHttpClient by lazy {
      OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        // A minute with no byte written or read is a dead connection.
        .writeTimeout(60, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()
    }

    /**
     * Makes sure a run is coming. Appended rather than kept: a run about to
     * finish could otherwise miss what was just added.
     */
    fun start(context: Context) {
      val request = OneTimeWorkRequestBuilder<UploadWorker>()
        .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
        .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
        .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
        .build()
      WorkManager.getInstance(context)
        .enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.APPEND_OR_REPLACE, request)
    }

    fun cancel(ids: Collection<String>) {
      ids.forEach { calls.remove(it)?.cancel() }
    }
  }

  private val lastProgress = ConcurrentHashMap<String, Long>()
  private val lastNotified = AtomicLong(0)

  override suspend fun getForegroundInfo(): ForegroundInfo = foregroundInfo(filesLeft())

  override suspend fun doWork(): Result = coroutineScope {
    try {
      setForeground(foregroundInfo(filesLeft()))
    } catch (_: Exception) {
      // Android 12 refuses a foreground service started from the background
      // in some cases. The job still runs, as an ordinary one.
    }
    // Stopped by the system: stop the transfers too, so they are not left
    // writing for a job that has gone. They stay queued for the next run.
    coroutineContext[Job]?.invokeOnCompletion { cause ->
      if (cause is CancellationException) calls.values.forEach { it.cancel() }
    }

    val claimed = ConcurrentHashMap.newKeySet<String>()
    val workers = (1..PARALLEL).map {
      async(Dispatchers.IO) {
        while (!isStopped) {
          val next = synchronized(claimed) {
            UploadStore.queue(applicationContext).firstOrNull { claimed.add(it.id) }
          } ?: break
          send(next)
          notifyProgress()
        }
      }
    }
    workers.awaitAll()

    // Whatever is left got no answer this run (or arrived as it ended): the
    // next run comes after a growing wait, once there is a network.
    if (UploadStore.queue(applicationContext).isEmpty()) Result.success() else Result.retry()
  }

  private fun send(item: UploadItem) {
    val context = applicationContext
    val file = fileOf(item.file)
    if (file == null || !file.exists()) {
      UploadStore.finish(context, item.id, 0, null, "That file is no longer on this device.")
      return
    }
    val offset = item.offset ?: 0L
    val length = item.length ?: file.length()
    val type = item.headers.entries
      .firstOrNull { it.key.equals("Content-Type", ignoreCase = true) }
      ?.value?.toMediaTypeOrNull()
    val body = FileRangeBody(file, offset, length, type) { sent -> progress(item.id, sent, length) }

    val request = Request.Builder().url(item.url).put(body)
    for ((name, value) in item.headers) {
      // OkHttp sets both from the body; given twice, a signed upload can hang.
      if (name.equals("Content-Length", ignoreCase = true)) continue
      if (name.equals("Content-Type", ignoreCase = true)) continue
      request.header(name, value)
    }
    val call = client.newCall(request.build())
    calls[item.id] = call
    try {
      call.execute().use { response ->
        UploadStore.finish(context, item.id, response.code, response.header("ETag"), null)
      }
    } catch (e: IOException) {
      when {
        // Removed in the app: it is already off the queue.
        call.isCanceled() && !isStopped -> Unit
        // The job is stopping: left queued for the next run.
        isStopped -> Unit
        item.attempts + 1 >= MAX_ATTEMPTS ->
          UploadStore.finish(context, item.id, 0, null, e.message ?: "Could not reach storage.")
        else -> UploadStore.retryLater(context, item.id)
      }
    } finally {
      calls.remove(item.id)
      lastProgress.remove(item.id)
    }
  }

  private fun progress(id: String, sent: Long, total: Long) {
    val listener = UploadStore.onProgress ?: return
    val now = System.currentTimeMillis()
    val last = lastProgress[id] ?: 0L
    if (now - last < 250 && sent < total) return
    lastProgress[id] = now
    listener(id, sent, total)
  }

  /** Files still to go: parts of one file count once. */
  private fun filesLeft(): Int =
    UploadStore.queue(applicationContext).map { it.id.substringBefore('#') }.toSet().size

  private suspend fun notifyProgress() {
    val now = System.currentTimeMillis()
    val last = lastNotified.get()
    if (now - last < 1000 || !lastNotified.compareAndSet(last, now)) return
    try {
      setForeground(foregroundInfo(filesLeft()))
    } catch (_: Exception) {
      // Not running as a foreground service; nothing to update.
    }
  }

  private fun foregroundInfo(left: Int): ForegroundInfo {
    val context = applicationContext
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL_ID) == null) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Uploads", NotificationManager.IMPORTANCE_LOW).apply {
          description = "Files on their way to Virgo"
        },
      )
    }
    val open = context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
      PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_IMMUTABLE)
    }
    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.stat_sys_upload)
      .setContentTitle("Uploading to Virgo")
      .setContentText(if (left == 1) "1 file left" else "$left files left")
      .setProgress(0, 0, true)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setContentIntent(open)
      .build()
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ForegroundInfo(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else {
      ForegroundInfo(NOTIFICATION_ID, notification)
    }
  }

  private fun fileOf(uri: String): File? {
    val path = if (uri.startsWith("file://")) Uri.parse(uri).path else uri
    return path?.let { File(it) }
  }
}

/** A byte range of a file as a request body, read 64 KB at a time. */
private class FileRangeBody(
  private val file: File,
  private val offset: Long,
  private val length: Long,
  private val type: MediaType?,
  private val onSent: (Long) -> Unit,
) : RequestBody() {
  override fun contentType(): MediaType? = type

  override fun contentLength(): Long = length

  override fun writeTo(sink: BufferedSink) {
    RandomAccessFile(file, "r").use { input ->
      input.seek(offset)
      val buffer = ByteArray(64 * 1024)
      var sent = 0L
      while (sent < length) {
        val read = input.read(buffer, 0, minOf(buffer.size.toLong(), length - sent).toInt())
        if (read < 0) throw IOException("The file ended early.")
        sink.write(buffer, 0, read)
        sent += read
        onSent(sent)
      }
    }
  }
}
