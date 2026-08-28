import CoreLocation
import Foundation
import React

@objc(DuavaraLocation)
final class DuavaraLocationModule: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(reverseGeocode:longitude:resolver:rejecter:)
  func reverseGeocode(
    _ latitude: Double,
    longitude: Double,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter _: @escaping RCTPromiseRejectBlock
  ) {
    guard latitude.isFinite, longitude.isFinite, (-90...90).contains(latitude), (-180...180).contains(longitude) else {
      resolve(nil)
      return
    }

    CLGeocoder().reverseGeocodeLocation(CLLocation(latitude: latitude, longitude: longitude)) { placemarks, _ in
      let placemark = placemarks?.first
      resolve(placemark?.subAdministrativeArea ?? placemark?.locality ?? placemark?.administrativeArea)
    }
  }
}
