import ExpoModulesCore

/// Answers iOS when it wakes Virgo because background uploads finished.
///
/// iOS relaunches the app (or wakes it, suspended) and hands over a handler
/// that must be called once the session's events have been taken in. Expo
/// passes the call to every app delegate subscriber and calls iOS back only
/// when each has answered; expo-file-system's subscriber keeps any handler it
/// is given until one of *its* sessions finishes, which ours never does, so
/// for our session it is told to let go as well. Without that, iOS would wait
/// on the app for every wake-up.
public final class VirgoUploadsAppDelegate: ExpoAppDelegateSubscriber {
  #if os(iOS) || os(tvOS)
  public func application(
    _ application: UIApplication,
    handleEventsForBackgroundURLSession identifier: String,
    completionHandler: @escaping () -> Void
  ) {
    guard identifier == VirgoUploadSession.identifier else {
      // Not ours: nothing to wait for.
      completionHandler()
      return
    }
    VirgoUploadSession.shared.backgroundCompletion = { [weak self] in
      completionHandler()
      let release = NSSelectorFromString("invokeCompletionHandlerForSessionIdentifier:")
      for subscriber in ExpoAppDelegateSubscriberRepository.subscribers {
        if let self = self, subscriber === self { continue }
        if subscriber.responds(to: release) {
          _ = subscriber.perform(release, with: identifier)
        }
      }
    }
    VirgoUploadSession.shared.start()
  }
  #endif
}
