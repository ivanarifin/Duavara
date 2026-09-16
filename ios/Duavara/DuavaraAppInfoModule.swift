import Foundation
import React

@objc(DuavaraAppInfo)
final class DuavaraAppInfoModule: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(getAppInfo:rejecter:)
  func getAppInfo(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter _: @escaping RCTPromiseRejectBlock
  ) {
    let bundle = Bundle.main
    let version = bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
    let build = bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String
    resolve([
      "version": version ?? "Unavailable",
      "build": build ?? "",
    ])
  }
}
