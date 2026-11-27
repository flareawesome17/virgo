package expo.modules.virgouploads

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** One transfer: a PUT of a file, or of one part of it. */
data class UploadItem(
  val id: String,
  val url: String,
  val headers: Map<String, String>,
  /** A file:// URI. */
  val file: String,
  val offset: Long?,
  val length: Long?,
  /** Tries that ended in no answer, for the worker's give-up rule. */
  val attempts: Int = 0,
) {
  fun toJson(): JSONObject = JSONObject().apply {
    put("id", id)
    put("url", url)
    put("headers", JSONObject(headers))
    put("file", file)
    offset?.let { put("offset", it) }
    length?.let { put("length", it) }
    put("attempts", attempts)
  }

  companion object {
    fun fromJson(json: JSONObject): UploadItem {
      val headers = mutableMapOf<String, String>()
      json.optJSONObject("headers")?.let { h -> h.keys().forEach { headers[it] = h.getString(it) } }
      return UploadItem(
        id = json.getString("id"),
        url = json.getString("url"),
        headers = headers,
        file = json.getString("file"),
        offset = if (json.has("offset")) json.getLong("offset") else null,
        length = if (json.has("length")) json.getLong("length") else null,
        attempts = json.optInt("attempts", 0),
      )
    }
  }
}

/**
 * The queue and what finished, as files in the app's own storage, so both
 * outlive the process: the worker runs with no JavaScript alive, and the
 * system may end the app between one transfer and the next.
 *
 * Every method is synchronized on this object; the files are small.
 */
object UploadStore {
  /** Set while JavaScript is listening. */
  @Volatile var onProgress: ((id: String, sent: Long, total: Long) -> Unit)? = null
  @Volatile var onFinished: ((result: Map<String, Any?>) -> Unit)? = null

  private fun dir(context: Context) = File(context.filesDir, "virgo-uploads").apply { mkdirs() }
  private fun queueFile(context: Context) = File(dir(context), "queue.json")
  private fun resultsFile(context: Context) = File(dir(context), "results.json")

  @Synchronized
  fun add(context: Context, items: List<UploadItem>) {
    val queue = readQueue(context)
    val known = queue.map { it.id }.toHashSet()
    writeQueue(context, queue + items.filter { known.add(it.id) })
  }

  @Synchronized
  fun queue(context: Context): List<UploadItem> = readQueue(context)

  @Synchronized
  fun remove(context: Context, ids: Collection<String>) {
    val drop = ids.toHashSet()
    writeQueue(context, readQueue(context).filterNot { it.id in drop })
  }

  /** Counts a try that got no answer; the item goes to the back of the line. */
  @Synchronized
  fun retryLater(context: Context, id: String) {
    val queue = readQueue(context)
    val item = queue.find { it.id == id } ?: return
    writeQueue(context, queue.filterNot { it.id == id } + item.copy(attempts = item.attempts + 1))
  }

  /** Takes an item off the queue and records how it ended. */
  @Synchronized
  fun finish(context: Context, id: String, status: Int, etag: String?, error: String?) {
    writeQueue(context, readQueue(context).filterNot { it.id == id })
    val result = mutableMapOf<String, Any?>("id" to id, "status" to status)
    etag?.let { result["etag"] = it }
    error?.let { result["error"] = it }
    val results = readResults(context)
    results.put(JSONObject(result))
    resultsFile(context).writeText(results.toString())
    onFinished?.invoke(result)
  }

  /** What finished since the last call, oldest first. Emptied as it is read. */
  @Synchronized
  fun takeResults(context: Context): List<Map<String, Any?>> {
    val results = readResults(context)
    resultsFile(context).delete()
    return (0 until results.length()).map { at ->
      val json = results.getJSONObject(at)
      json.keys().asSequence().associateWith { json.get(it) }
    }
  }

  /** The queue as last read or written, so it is parsed once per process. */
  private var cached: List<UploadItem>? = null

  private fun readQueue(context: Context): List<UploadItem> {
    cached?.let { return it }
    val file = queueFile(context)
    val items = if (!file.exists()) {
      emptyList()
    } else {
      try {
        val array = JSONArray(file.readText())
        (0 until array.length()).map { UploadItem.fromJson(array.getJSONObject(it)) }
      } catch (_: Exception) {
        emptyList()
      }
    }
    cached = items
    return items
  }

  private fun writeQueue(context: Context, items: List<UploadItem>) {
    cached = items
    val file = queueFile(context)
    if (items.isEmpty()) {
      file.delete()
      return
    }
    val array = JSONArray()
    items.forEach { array.put(it.toJson()) }
    val temp = File(file.parentFile, "queue.json.tmp")
    temp.writeText(array.toString())
    temp.renameTo(file)
  }

  private fun readResults(context: Context): JSONArray {
    val file = resultsFile(context)
    if (!file.exists()) return JSONArray()
    return try {
      JSONArray(file.readText())
    } catch (_: Exception) {
      JSONArray()
    }
  }
}
