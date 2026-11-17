package expo.modules.virgofilerange

import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile

/**
 * Copies one byte range of a file into a file of its own.
 *
 * A large upload goes up in parts, and the native uploader sends a whole
 * file, so each part has to be cut out first. Doing that in JavaScript moved
 * every byte of a film through the thread that answers taps. Here it runs on
 * a background thread and JavaScript only waits.
 */
class VirgoFileRangeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VirgoFileRange")

    // Resolves with the bytes copied, which is less than `length` only when
    // the source ended early: the caller decides what that means.
    AsyncFunction("copyRange") { source: String, destination: String, start: Long, length: Long ->
      val input = fileOf(source)
      val output = fileOf(destination)
      output.parentFile?.mkdirs()

      var remaining = maxOf(length, 0L)
      RandomAccessFile(input, "r").use { reader ->
        reader.seek(maxOf(start, 0L))
        FileOutputStream(output, false).use { writer ->
          val buffer = ByteArray(CHUNK)
          while (remaining > 0) {
            val want = minOf(remaining, CHUNK.toLong()).toInt()
            val read = reader.read(buffer, 0, want)
            if (read <= 0) break
            writer.write(buffer, 0, read)
            remaining -= read
          }
        }
      }
      maxOf(length, 0L) - remaining
    }
  }

  private fun fileOf(uri: String): File {
    val path = if (uri.startsWith("file:")) Uri.parse(uri).path else uri
    return File(requireNotNull(path) { "Not a file on this device: $uri" })
  }

  companion object {
    // Read and written a megabyte at a time: one buffer in memory, never the part.
    private const val CHUNK = 1 shl 20
  }
}
