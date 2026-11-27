package expo.modules.virgouploads

import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/** One transfer, as JavaScript hands it over. Always a PUT. */
class UploadItemRecord : Record {
  @Field val id: String = ""
  @Field val url: String = ""
  @Field val headers: Map<String, String> = emptyMap()
  /** A file:// URI. */
  @Field val file: String = ""
  /** With `length`: send only this part of the file. */
  @Field val offset: Double? = null
  @Field val length: Double? = null
}

/**
 * JavaScript's side of UploadWorker. The same interface as iOS's.
 *
 * Events are a nudge, not the record: `takeResults` is what says what
 * finished, and it holds whatever ended while no JavaScript was running.
 */
class VirgoUploadsModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("VirgoUploads")

    Events("progress", "finished")

    OnCreate {
      // A queue left by an earlier process, still waiting: make sure it runs.
      if (UploadStore.queue(context).isNotEmpty()) UploadWorker.start(context)
    }

    OnStartObserving {
      UploadStore.onProgress = { id, sent, total ->
        sendEvent("progress", mapOf("id" to id, "sent" to sent.toDouble(), "total" to total.toDouble()))
      }
      UploadStore.onFinished = { result -> sendEvent("finished", result) }
    }

    OnStopObserving {
      UploadStore.onProgress = null
      UploadStore.onFinished = null
    }

    AsyncFunction("enqueue") { records: List<UploadItemRecord> ->
      val items = records.map {
        UploadItem(
          id = it.id,
          url = it.url,
          headers = it.headers,
          file = it.file,
          offset = it.offset?.toLong(),
          length = it.length?.toLong(),
        )
      }
      UploadStore.add(context, items)
      UploadWorker.start(context)
      items.size
    }

    AsyncFunction("active") {
      UploadStore.queue(context).map { it.id }
    }

    AsyncFunction("takeResults") {
      UploadStore.takeResults(context)
    }

    AsyncFunction("cancel") { ids: List<String> ->
      UploadStore.remove(context, ids)
      UploadWorker.cancel(ids)
    }
  }
}
