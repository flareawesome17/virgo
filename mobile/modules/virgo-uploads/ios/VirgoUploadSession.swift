import Foundation

/// Background uploads on iOS (docs/BACKGROUND_UPLOADS.md).
///
/// One background `URLSession` with a fixed identifier holds every transfer.
/// iOS carries them on with the app suspended, or ended by the system, and
/// wakes the app when they are done; because the identifier never changes, a
/// relaunched app reconnects to the same session and can still see them.
/// (expo-file-system names its session afresh in every process, which is why
/// a relaunched app could never find its uploads.)
///
/// What finished is written to disk as it happens, for JavaScript to collect
/// whenever it next runs: a transfer can end while no JavaScript is alive.
/// iOS cancels everything when the person swipes the app away; no app can
/// carry an upload past that.
final class VirgoUploadSession: NSObject, URLSessionDataDelegate {
  static let shared = VirgoUploadSession()

  static var identifier: String {
    "\(Bundle.main.bundleIdentifier ?? "ph.virgo").uploads"
  }

  /// Set while JavaScript is listening. Called on the session's queue.
  var onProgress: ((_ id: String, _ sent: Int64, _ total: Int64) -> Void)?
  var onFinished: ((_ result: [String: Any]) -> Void)?

  /// iOS's handler from a wake-up, called once the session's events are in.
  var backgroundCompletion: (() -> Void)?

  /// Everything that touches the files below runs here, in order.
  private let queue = DispatchQueue(label: "ph.virgo.uploads")
  private var lastProgress: [String: Date] = [:]

  private lazy var directory: URL = {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    let dir = base.appendingPathComponent("VirgoUploads", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }()
  private var partsDirectory: URL {
    let dir = directory.appendingPathComponent("parts", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }
  private var resultsFile: URL { directory.appendingPathComponent("results.json") }

  private lazy var session: URLSession = {
    let config = URLSessionConfiguration.background(withIdentifier: VirgoUploadSession.identifier)
    config.sessionSendsLaunchEvents = true
    config.isDiscretionary = false
    config.httpMaximumConnectionsPerHost = 4
    // The URLs live a day. A transfer still trying after that can only be
    // refused, so it is let go with an error rather than kept for a week.
    config.timeoutIntervalForResource = 26 * 60 * 60
    let delegates = OperationQueue()
    delegates.maxConcurrentOperationCount = 1
    return URLSession(configuration: config, delegate: self, delegateQueue: delegates)
  }()

  /// Connects to the session, so transfers that ended while the app was gone
  /// report in. Called at launch and on every wake-up.
  func start() {
    _ = session
  }

  struct Item {
    let id: String
    let url: URL
    let headers: [String: String]
    let file: URL
    let offset: Int64?
    let length: Int64?
  }

  /// Hands transfers to iOS, all at once: tasks created while the app is in
  /// front start promptly, and iOS slows down ones created from the
  /// background. A part is cut into a file of its own first, because a
  /// background session sends whole files. An item whose file cannot be read
  /// is reported finished with status 0 rather than failing the rest.
  func enqueue(_ items: [Item], done: @escaping (Int) -> Void) {
    queue.async {
      var started = 0
      for item in items {
        do {
          let source = try self.sourceFile(for: item)
          var request = URLRequest(url: item.url)
          request.httpMethod = "PUT"
          for (name, value) in item.headers where name.lowercased() != "content-length" {
            request.setValue(value, forHTTPHeaderField: name)
          }
          let task = self.session.uploadTask(with: request, fromFile: source)
          task.taskDescription = item.id
          task.resume()
          started += 1
        } catch {
          self.record(["id": item.id, "status": 0, "error": "The file could not be read: \(error.localizedDescription)"])
        }
      }
      done(started)
    }
  }

  /// Ids of the transfers iOS still holds.
  func active(done: @escaping ([String]) -> Void) {
    session.getAllTasks { tasks in
      done(tasks.filter { $0.state == .running || $0.state == .suspended }.compactMap { $0.taskDescription })
    }
  }

  /// What finished since the last call, oldest first. Emptied as it is read.
  func takeResults() -> [[String: Any]] {
    queue.sync {
      let results = readResults()
      try? FileManager.default.removeItem(at: resultsFile)
      return results
    }
  }

  func cancel(_ ids: [String], done: @escaping () -> Void) {
    let wanted = Set(ids)
    session.getAllTasks { tasks in
      for task in tasks where wanted.contains(task.taskDescription ?? "") {
        task.cancel()
      }
      done()
    }
  }

  // MARK: - URLSession

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    didSendBodyData bytesSent: Int64,
    totalBytesSent: Int64,
    totalBytesExpectedToSend: Int64
  ) {
    guard let id = task.taskDescription, let onProgress = onProgress else { return }
    // A few times a second is all a bar can draw.
    let now = Date()
    if let last = lastProgress[id], now.timeIntervalSince(last) < 0.25, totalBytesSent < totalBytesExpectedToSend {
      return
    }
    lastProgress[id] = now
    onProgress(id, totalBytesSent, totalBytesExpectedToSend)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    guard let id = task.taskDescription else { return }
    lastProgress.removeValue(forKey: id)
    let response = task.response as? HTTPURLResponse
    var result: [String: Any] = ["id": id, "status": response?.statusCode ?? 0]
    if let etag = response?.value(forHTTPHeaderField: "ETag") {
      result["etag"] = etag
    }
    if let error = error as NSError? {
      result["status"] = 0
      result["error"] = error.code == NSURLErrorCancelled ? "cancelled" : error.localizedDescription
    }
    queue.async {
      try? FileManager.default.removeItem(at: self.partFile(for: id))
      self.record(result)
    }
  }

  func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    // The results are on disk by now: record() runs on the queue, in order.
    queue.async {
      DispatchQueue.main.async {
        self.backgroundCompletion?()
        self.backgroundCompletion = nil
      }
    }
  }

  // MARK: - Files

  private func sourceFile(for item: Item) throws -> URL {
    guard let offset = item.offset, let length = item.length else {
      guard FileManager.default.fileExists(atPath: item.file.path) else {
        throw CocoaError(.fileNoSuchFile)
      }
      return item.file
    }
    let destination = partFile(for: item.id)
    let input = try FileHandle(forReadingFrom: item.file)
    defer { try? input.close() }
    FileManager.default.createFile(atPath: destination.path, contents: nil)
    let output = try FileHandle(forWritingTo: destination)
    defer { try? output.close() }
    try input.seek(toOffset: UInt64(max(offset, 0)))
    var remaining = max(length, 0)
    while remaining > 0 {
      let want = Int(min(remaining, 1 << 20))
      let bytes: Data = try autoreleasepool { try input.read(upToCount: want) ?? Data() }
      if bytes.isEmpty { break }
      try output.write(contentsOf: bytes)
      remaining -= Int64(bytes.count)
    }
    if remaining > 0 {
      try? FileManager.default.removeItem(at: destination)
      throw CocoaError(.fileReadCorruptFile)
    }
    return destination
  }

  private func partFile(for id: String) -> URL {
    let safe = id.unicodeScalars.map { CharacterSet.alphanumerics.contains($0) ? String($0) : "_" }.joined()
    return partsDirectory.appendingPathComponent("\(safe).part")
  }

  /// Appends one result, on the queue. Also tells JavaScript, if it listens.
  private func record(_ result: [String: Any]) {
    var results = readResults()
    results.append(result)
    if let data = try? JSONSerialization.data(withJSONObject: results) {
      try? data.write(to: resultsFile, options: .atomic)
    }
    onFinished?(result)
  }

  private func readResults() -> [[String: Any]] {
    guard
      let data = try? Data(contentsOf: resultsFile),
      let parsed = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
    else { return [] }
    return parsed
  }
}
