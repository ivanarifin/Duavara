import CoreLocation
import Foundation
import React
import UIKit

@objc(QiblaCompass)
final class QiblaCompass: RCTEventEmitter, CLLocationManagerDelegate {
  private let locationManager = CLLocationManager()
  private let headingEvent = "QiblaCompassHeading"
  private var isStarted = false
  private var isStarting = false
  private var hasListeners = false
  private var pendingStartResolve: RCTPromiseResolveBlock?
  private var pendingStartReject: RCTPromiseRejectBlock?

  override init() {
    super.init()
    locationManager.delegate = self
    locationManager.desiredAccuracy = kCLLocationAccuracyBest
    locationManager.headingFilter = kCLHeadingFilterNone
    locationManager.headingOrientation = .portrait
  }

  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func supportedEvents() -> [String]! {
    [headingEvent]
  }

  override func startObserving() {
    hasListeners = true
  }

  override func stopObserving() {
    hasListeners = false
  }

  @objc(start:resolver:rejecter:)
  func start(
    _ options: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    _ = options

    if isStarted {
      resolve(["north": "true"])
      return
    }

    if isStarting {
      reject("start_in_progress", "Qibla compass authorization is already in progress.", nil)
      return
    }

    guard CLLocationManager.locationServicesEnabled() else {
      reject("location_services_disabled", "Location services are disabled.", nil)
      return
    }

    guard CLLocationManager.headingAvailable() else {
      reject("heading_unsupported", "This device does not support heading updates.", nil)
      return
    }

    switch locationManager.authorizationStatus {
    case .authorizedWhenInUse, .authorizedAlways:
      beginStarting(resolve: resolve)
    case .notDetermined:
      isStarting = true
      pendingStartResolve = resolve
      pendingStartReject = reject
      locationManager.requestWhenInUseAuthorization()
    case .denied:
      reject("location_permission_denied", "Location permission was denied.", nil)
    case .restricted:
      reject("location_permission_restricted", "Location permission is restricted.", nil)
    @unknown default:
      reject("location_permission_unknown", "Location permission status is unavailable.", nil)
    }
  }

  @objc(stop:rejecter:)
  func stop(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter _: @escaping RCTPromiseRejectBlock
  ) {
    if isStarting {
      isStarting = false
      pendingStartResolve = nil
      pendingStartReject?("start_cancelled", "Qibla compass start was cancelled.", nil)
      pendingStartReject = nil
    }

    if isStarted {
      isStarted = false
      locationManager.stopUpdatingHeading()
      locationManager.stopUpdatingLocation()
    }

    resolve(nil)
  }

  private func beginStarting(resolve: @escaping RCTPromiseResolveBlock) {
    isStarting = false
    isStarted = true
    locationManager.headingOrientation = currentHeadingOrientation()
    locationManager.startUpdatingLocation()
    locationManager.startUpdatingHeading()
    resolve(["north": "true"])
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    guard isStarting else { return }

    switch manager.authorizationStatus {
    case .authorizedWhenInUse, .authorizedAlways:
      guard let resolve = pendingStartResolve, let reject = pendingStartReject else {
        isStarting = false
        return
      }
      pendingStartResolve = nil
      pendingStartReject = nil
      beginStarting(resolve: resolve)
    case .denied:
      finishPendingStart(
        code: "location_permission_denied",
        message: "Location permission was denied."
      )
    case .restricted:
      finishPendingStart(
        code: "location_permission_restricted",
        message: "Location permission is restricted."
      )
    case .notDetermined:
      break
    @unknown default:
      finishPendingStart(
        code: "location_permission_unknown",
        message: "Location permission status is unavailable."
      )
    }
  }

  func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
    guard isStarted, hasListeners else { return }
    guard newHeading.headingAccuracy >= 0 else { return }

    let trueHeading = newHeading.trueHeading
    guard trueHeading >= 0 else { return }

    locationManager.headingOrientation = currentHeadingOrientation()
    sendEvent(
      withName: headingEvent,
      body: [
        "heading": normalizedHeading(trueHeading),
        "accuracy": newHeading.headingAccuracy,
        "north": "true",
        "timestamp": newHeading.timestamp.timeIntervalSince1970 * 1000,
      ]
    )
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    guard let locationError = error as? CLError else { return }

    if locationError.code == .denied && isStarting {
      finishPendingStart(
        code: "location_permission_denied",
        message: "Location permission was denied."
      )
    } else if locationError.code == .headingFailure && isStarting {
      finishPendingStart(
        code: "heading_unavailable",
        message: "True-north heading is unavailable."
      )
    } else if isStarted && (locationError.code == .denied || locationError.code == .headingFailure) {
      isStarted = false
      locationManager.stopUpdatingHeading()
      locationManager.stopUpdatingLocation()
    }
  }

  private func finishPendingStart(code: String, message: String) {
    isStarting = false
    let reject = pendingStartReject
    pendingStartResolve = nil
    pendingStartReject = nil
    reject?(code, message, nil)
  }

  private func currentHeadingOrientation() -> CLDeviceOrientation {
    let interfaceOrientation = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .first(where: {
        $0.activationState == .foregroundActive && $0.interfaceOrientation != .unknown
      })?
      .interfaceOrientation ?? .portrait

    switch interfaceOrientation {
    case .portrait:
      return .portrait
    case .portraitUpsideDown:
      return .portraitUpsideDown
    case .landscapeLeft:
      return .landscapeRight
    case .landscapeRight:
      return .landscapeLeft
    default:
      return .portrait
    }
  }

  private func normalizedHeading(_ heading: CLLocationDirection) -> CLLocationDirection {
    let normalized = heading.truncatingRemainder(dividingBy: 360)
    return normalized >= 0 ? normalized : normalized + 360
  }
}
