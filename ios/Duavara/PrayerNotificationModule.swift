import AVFoundation
import CoreFoundation
import Foundation
import React
import UserNotifications

@objc(DuavaraNotifications)
final class PrayerNotificationModule: NSObject, UNUserNotificationCenterDelegate {
  private let notificationCenter = UNUserNotificationCenter.current()
  private let notificationPrefix = "duavara-"
  private let maximumNotifications = 50
  private let adhanVolumeCategories: Set<String> = ["alarm", "media", "notification"]
  private var adhanPlayer: AVAudioPlayer?

  override init() {
    super.init()
    notificationCenter.delegate = self
  }

  @objc static func requiresMainQueueSetup() -> Bool {
    true
  }

  @objc(requestPermission:rejecter:)
  func requestPermission(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    notificationCenter.requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
      if let error {
        reject("permission_error", error.localizedDescription, error)
        return
      }
      resolve(granted)
    }
  }

  @objc(getNotificationHealth:rejecter:)
  func getNotificationHealth(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter _: @escaping RCTPromiseRejectBlock
  ) {
    notificationCenter.getNotificationSettings { settings in
      let notifications: String
      switch settings.authorizationStatus {
      case .authorized, .provisional, .ephemeral:
        notifications = "allowed"
      case .denied:
        notifications = "blocked"
      case .notDetermined:
        notifications = "notDetermined"
      @unknown default:
        notifications = "unknown"
      }
      resolve([
        "notifications": notifications,
        "timing": "notApplicable",
        "batteryOptimization": "notApplicable",
        "bootRescheduling": "notApplicable",
      ])
    }
  }

  @objc(openExactAlarmSettings:rejecter:)
  func openExactAlarmSettings(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    reject("unsupported", "Exact alarm settings are not available on iOS.", nil)
  }

  @objc(openBatteryOptimizationSettings:rejecter:)
  func openBatteryOptimizationSettings(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    reject("unsupported", "Battery optimization settings are not available on iOS.", nil)
  }

  @objc(playAdhanPreview:resolver:rejecter:)
  func playAdhanPreview(
    _ volumeCategory: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard adhanVolumeCategories.contains(volumeCategory) else {
      reject(
        "invalid_notification_category",
        "Volume category must be one of alarm, media, or notification.",
        nil
      )
      return
    }

    stopAdhanPlayback()

    guard let url = Bundle.main.url(forResource: "adhan_full", withExtension: "m4a") else {
      reject("preview_asset_missing", "The full adhan audio file is not bundled.", nil)
      return
    }

    do {
      // iOS has no equivalent volume streams; AVAudioPlayer uses its normal output.
      let player = try AVAudioPlayer(contentsOf: url)
      player.prepareToPlay()
      guard player.play() else {
        reject("preview_playback_failed", "The full adhan preview could not be played.", nil)
        return
      }
      adhanPlayer = player
      resolve(true)
    } catch {
      reject("preview_error", error.localizedDescription, error)
    }
  }

  @objc(stopAdhanPreview:rejecter:)
  func stopAdhanPreview(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter _: @escaping RCTPromiseRejectBlock
  ) {
    stopAdhanPlayback()
    resolve(nil)
  }

  @objc(schedule:resolver:rejecter:)
  func schedule(
    _ notifications: NSArray,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard notifications.count <= maximumNotifications else {
      reject(
        "invalid_notifications",
        "A maximum of \(maximumNotifications) notifications can be scheduled.",
        nil
      )
      return
    }

    let now = Date()
    var requests: [UNNotificationRequest] = []
    var identifiers = Set<String>()
    requests.reserveCapacity(notifications.count)

    for (index, value) in notifications.enumerated() {
      guard
        let notification = value as? NSDictionary,
        let id = notification["id"] as? String,
        !id.isEmpty,
        identifiers.insert(id).inserted,
        let title = notification["title"] as? String,
        let body = notification["body"] as? String,
        let timestamp = notification["at"] as? NSNumber,
        !isBoolean(timestamp),
        timestamp.doubleValue.isFinite,
        let adhan = notification["adhan"] as? NSNumber,
        isBoolean(adhan)
      else {
        reject(
          "invalid_notification",
          "Notification at index \(index) must contain id, title, body, at, and adhan with valid types.",
          nil
        )
        return
      }

      guard normalizedAdhanVolumeCategory(from: notification) != nil else {
        reject(
          "invalid_notification_category",
          "Notification at index \(index) must use alarm, media, or notification as its volume category.",
          nil
        )
        return
      }

      let date = Date(timeIntervalSince1970: timestamp.doubleValue / 1000)
      guard date.timeIntervalSince1970.isFinite, date > now else {
        continue
      }

      var content = UNMutableNotificationContent()
      content.title = title
      content.body = body
      content.sound = adhan.boolValue
        ? UNNotificationSound(named: UNNotificationSoundName(rawValue: "adhan_short.caf"))
        : .default

      let components = Calendar.current.dateComponents(
        [.calendar, .era, .year, .month, .day, .hour, .minute, .second],
        from: date
      )
      let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
      requests.append(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
    }

    cancelPendingNotifications(withPrefix: notificationPrefix) { [weak self] in
      guard let self else {
        reject("module_unavailable", "The notification module is unavailable.", nil)
        return
      }
      self.add(requests, at: 0, resolve: resolve, reject: reject)
    }
  }

  @objc(cancelWithPrefix:resolver:rejecter:)
  func cancelWithPrefix(
    _ prefix: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter _: @escaping RCTPromiseRejectBlock
  ) {
    cancelPendingNotifications(withPrefix: prefix) {
      resolve(nil)
    }
  }

  func userNotificationCenter(
    _: UNUserNotificationCenter,
    willPresent _: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .list, .sound])
  }

  private func stopAdhanPlayback() {
    adhanPlayer?.stop()
    adhanPlayer = nil
  }

  private func isBoolean(_ value: NSNumber) -> Bool {
    CFGetTypeID(value) == CFBooleanGetTypeID()
  }

  private func normalizedAdhanVolumeCategory(from notification: NSDictionary) -> String? {
    guard let value = notification["adhanVolumeCategory"] else {
      return "notification"
    }
    guard let category = value as? String, adhanVolumeCategories.contains(category) else {
      return nil
    }
    return category
  }

  private func cancelPendingNotifications(withPrefix prefix: String, completion: @escaping () -> Void) {
    notificationCenter.getPendingNotificationRequests { [notificationCenter] requests in
      let identifiers = requests
        .map(\.identifier)
        .filter { $0.hasPrefix(prefix) }
      notificationCenter.removePendingNotificationRequests(withIdentifiers: identifiers)
      completion()
    }
  }

  private func add(
    _ requests: [UNNotificationRequest],
    at index: Int,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard index < requests.count else {
      resolve(requests.map(\.identifier))
      return
    }

    notificationCenter.add(requests[index]) { [self] error in
      if let error {
        reject("schedule_error", error.localizedDescription, error)
        return
      }
      self.add(requests, at: index + 1, resolve: resolve, reject: reject)
    }
  }
}
