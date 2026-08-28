#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(DuavaraLocation, NSObject)

RCT_EXTERN_METHOD(reverseGeocode:(double)latitude
                  longitude:(double)longitude
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
