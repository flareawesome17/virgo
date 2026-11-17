import ExpoModulesCore

/// Copies one byte range of a file into a file of its own.
///
/// A large upload goes up in parts, and the native uploader sends a whole
/// file, so each part has to be cut out first. Doing that in JavaScript moved
/// every byte of a film through the thread that answers taps; a 1 GB film was
/// 1 GB of JavaScript memory churned through, and the app stalled while it
/// went. Here it runs on the module's own queue and JavaScript only waits.
public class VirgoFileRangeModule: Module {
  /// Read and written a megabyte at a time: one buffer in memory, never the part.
  private static let chunk = 1 << 20

  public func definition() -> ModuleDefinition {
    Name("VirgoFileRange")

    /// Resolves with the bytes copied, which is less than `length` only when
    /// the source ended early: the caller decides what that means.
    AsyncFunction("copyRange") { (source: URL, destination: URL, start: Int64, length: Int64) -> Int64 in
      let input = try FileHandle(forReadingFrom: source)
      defer { try? input.close() }

      FileManager.default.createFile(atPath: destination.path, contents: nil)
      let output = try FileHandle(forWritingTo: destination)
      defer { try? output.close() }

      try input.seek(toOffset: UInt64(max(start, 0)))
      var remaining = max(length, 0)
      while remaining > 0 {
        let want = Int(min(remaining, Int64(VirgoFileRangeModule.chunk)))
        let bytes: Data = try autoreleasepool {
          try input.read(upToCount: want) ?? Data()
        }
        if bytes.isEmpty { break }
        try output.write(contentsOf: bytes)
        remaining -= Int64(bytes.count)
      }
      return max(length, 0) - remaining
    }
  }
}
