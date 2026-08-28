package id.vandev.duavara.widget

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray

class DuavaraWidgetModule(
  private val context: ReactApplicationContext,
) : ReactContextBaseJavaModule(context) {
  override fun getName(): String = NAME

  @ReactMethod
  fun clearPrayerSchedule(promise: Promise) {
    try {
      PrayerWidgetStore.clear(context)
      NextPrayerWidgetProvider.refresh(context)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("WIDGET_CLEAR_FAILED", "Unable to clear the prayer widget", error)
    }
  }

  @ReactMethod
  fun updatePrayerSchedule(prayers: ReadableArray, locationLabel: String?, promise: Promise) {
    try {
      val normalized = buildList {
        for (index in 0 until prayers.size()) {
          val item = prayers.getMap(index) ?: continue
          val name = item.getString("name")?.trim().orEmpty()
          val time = item.getString("time")?.trim().orEmpty()
          if (!item.hasKey("at") || item.isNull("at")) continue
          val at = item.getDouble("at").toLong()
          if (name.isNotEmpty() && time.matches(TIME_PATTERN) && at > 0) {
            add(WidgetPrayer(name, time, at))
          }
        }
      }.distinctBy { it.at to it.name }.sortedBy { it.at }

      if (normalized.isEmpty()) {
        promise.reject("INVALID_WIDGET_SCHEDULE", "At least one valid prayer is required")
        return
      }

      PrayerWidgetStore.save(context, normalized, locationLabel)
      NextPrayerWidgetProvider.refresh(context)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("WIDGET_UPDATE_FAILED", "Unable to update the prayer widget", error)
    }
  }

  companion object {
    const val NAME = "DuavaraWidget"
    private val TIME_PATTERN = Regex("^([01]\\d|2[0-3]):[0-5]\\d$")
  }
}
