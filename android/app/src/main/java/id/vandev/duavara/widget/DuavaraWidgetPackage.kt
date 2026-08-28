package id.vandev.duavara.widget

import com.facebook.react.ReactPackage
import id.vandev.duavara.compass.QiblaCompassModule
import id.vandev.duavara.notifications.DuavaraNotificationsModule
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class DuavaraWidgetPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(
      DuavaraWidgetModule(reactContext),
      QiblaCompassModule(reactContext),
      DuavaraNotificationsModule(reactContext),
    )

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
    emptyList()
}
