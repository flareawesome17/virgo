import ExpoModulesCore

/// One transfer, as JavaScript hands it over. Always a PUT.
struct UploadItemRecord: Record {
  @Field var id: String = ""
  @Field var url: String = ""
  @Field var headers: [String: String] = [:]
  /// A file:// URI.
  @Field var file: String = ""
  /// With `length`: send only this part of the file.
  @Field var offset: Double? = nil
  @Field var length: Double? = nil
}

/// JavaScript's side of VirgoUploadSession. The same interface as Android's.
///
/// Events are a nudge, not the record: `takeResults` is what says what
/// finished, and it holds whatever ended while no JavaScript was running.
public class VirgoUploadsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VirgoUploads")

    Events("progress", "finished")

    OnCreate {
      VirgoUploadSession.shared.start()
    }

    OnStartObserving {
      VirgoUploadSession.shared.onProgress = { [weak self] id, sent, total in
        self?.sendEvent("progress", ["id": id, "sent": Double(sent), "total": Double(total)])
      }
      VirgoUploadSession.shared.onFinished = { [weak self] result in
        self?.sendEvent("finished", result)
      }
    }

    OnStopObserving {
      VirgoUploadSession.shared.onProgress = nil
      VirgoUploadSession.shared.onFinished = nil
    }

    /// Resolves with how many were handed to iOS. Any that could not be are
    /// already in `takeResults`, with status 0 and the reason.
    AsyncFunction("enqueue") { (records: [UploadItemRecord], promise: Promise) in
      var items: [VirgoUploadSession.Item] = []
      for record in records {
        guard let url = URL(string: record.url), let file = URL(string: record.file), file.isFileURL else {
          continue
        }
        items.append(
          VirgoUploadSession.Item(
            id: record.id,
            url: url,
            headers: record.headers,
            file: file,
            offset: record.offset.map { Int64($0) },
            length: record.length.map { Int64($0) }
          ))
      }
      VirgoUploadSession.shared.enqueue(items) { started in
        promise.resolve(started)
      }
    }

    AsyncFunction("active") { (promise: Promise) in
      VirgoUploadSession.shared.active { ids in
        promise.resolve(ids)
      }
    }

    AsyncFunction("takeResults") { () -> [[String: Any]] in
      VirgoUploadSession.shared.takeResults()
    }

    AsyncFunction("cancel") { (ids: [String], promise: Promise) in
      VirgoUploadSession.shared.cancel(ids) {
        promise.resolve(nil)
      }
    }
  }
}
