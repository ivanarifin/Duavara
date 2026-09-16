#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(DuavaraAppInfo, NSObject)

RCT_EXTERN_METHOD(getAppInfo:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
