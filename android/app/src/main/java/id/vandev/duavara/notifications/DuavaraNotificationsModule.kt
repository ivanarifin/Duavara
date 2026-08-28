package id.vandev.duavara.notifications

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import id.vandev.duavara.R

class DuavaraNotificationsModule(
  private val context: ReactApplicationContext,
) : ReactContextBaseJavaModule(context), LifecycleEventListener {
  private var adhanPlayer: MediaPlayer? = null

  private var permissionRequestInFlight = false

  init {
    context.addLifecycleEventListener(this)
  }

  override fun getName(): String = NAME

  @ReactMethod
  fun requestPermission(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      promise.resolve(NotificationManagerCompat.from(context).areNotificationsEnabled())
      return
    }

    if (context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
      promise.resolve(NotificationManagerCompat.from(context).areNotificationsEnabled())
      return
    }
    if (permissionRequestInFlight) {
      promise.reject("permission_request_in_progress", "A notification permission request is already in progress")
      return
    }

    val activity = context.currentActivity
    if (activity !is PermissionAwareActivity) {
      promise.reject("activity_unavailable", "Notification permission requires an active activity")
      return
    }

    permissionRequestInFlight = true
    try {
      activity.requestPermissions(
        arrayOf(Manifest.permission.POST_NOTIFICATIONS),
        PERMISSION_REQUEST_CODE,
        PermissionListener { _, _, grantResults ->
          permissionRequestInFlight = false
          promise.resolve(
            grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED &&
              NotificationManagerCompat.from(context).areNotificationsEnabled(),
          )
          true
        },
      )
      context.getSharedPreferences(PREFERENCES_NAME, android.content.Context.MODE_PRIVATE)
        .edit()
        .putBoolean(PERMISSION_REQUESTED_KEY, true)
        .apply()
    } catch (error: Exception) {
      permissionRequestInFlight = false
      promise.reject("permission_request_failed", "Unable to request notification permission", error)
    }
  }

  @ReactMethod
  fun getNotificationHealth(promise: Promise) {
    val notificationsEnabled = NotificationManagerCompat.from(context).areNotificationsEnabled()
    val permissionStatus = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      notificationPermissionStatus()
    } else {
      "allowed"
    }
    promise.resolve(
      mapOf(
        "notifications" to if (!notificationsEnabled) "blocked" else permissionStatus,
        "timing" to exactAlarmStatus(),
        "batteryOptimization" to batteryOptimizationStatus(),
        "bootRescheduling" to "supported",
      ),
    )
  }

  @ReactMethod
  fun openExactAlarmSettings(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      promise.reject("unsupported", "Exact alarm settings are not available on this Android version")
      return
    }
    if (exactAlarmStatus() == "exact") {
      promise.reject("unsupported", "Exact alarms are already allowed")
      return
    }
    openSettingsIntent(
      Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, packageUri()),
      promise,
    )
  }

  @ReactMethod
  fun openBatteryOptimizationSettings(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      promise.reject("unsupported", "Battery optimization settings are not available on this Android version")
      return
    }
    val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    if (powerManager.isIgnoringBatteryOptimizations(context.packageName)) {
      promise.reject("unsupported", "Battery optimization is already unrestricted")
      return
    }
    openSettingsIntent(
      Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS),
      promise,
    )
  }

  @ReactMethod
  fun schedule(notifications: ReadableArray, promise: Promise) {
    try {
      if (notifications.size() > MAX_NOTIFICATIONS) {
        promise.reject("invalid_notifications", "A maximum of $MAX_NOTIFICATIONS notifications can be scheduled")
        return
      }

      val now = System.currentTimeMillis()
      val ids = HashSet<String>(notifications.size())
      val future = ArrayList<StoredNotification>(notifications.size())
      for (index in 0 until notifications.size()) {
        val item = notifications.getMap(index)
        val notification = parseNotification(item, index, now)
        if (!ids.add(notification.id)) {
          promise.reject("invalid_notification", "Notification at index $index has a duplicate id")
          return
        }
        if (notification.at > now) future.add(notification)
      }

      val old = NotificationStore.load(context).filter { it.id.startsWith(NOTIFICATION_PREFIX) }
      old.forEach { PrayerAlarmScheduler.cancel(context, it.id) }
      NotificationStore.replace(context, future)
      future.forEach { notification -> PrayerAlarmScheduler.schedule(context, notification) }
      promise.resolve(future.map { it.id })
    } catch (error: Exception) {
      if (error is InvalidNotificationCategoryException) {
        promise.reject("invalid_notification_category", error.message)
      } else {
        Log.e(NAME, "Unable to schedule notifications", error)
        promise.reject(
          "schedule_error",
          "Unable to schedule notifications: ${error.message ?: error.javaClass.simpleName}",
          error,
        )
      }
    }
  }

  @ReactMethod
  fun cancelWithPrefix(prefix: String, promise: Promise) {
    try {
      val stored = NotificationStore.load(context)
      stored.filter { it.id.startsWith(prefix) }
        .forEach { PrayerAlarmScheduler.cancel(context, it.id) }
      NotificationStore.replace(context, stored.filterNot { it.id.startsWith(prefix) })
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("cancel_error", "Unable to cancel notifications", error)
    }
  }

  @ReactMethod
  fun playAdhanPreview(categoryValue: String, promise: Promise) {
    val category = AdhanVolumeCategory.fromValue(categoryValue)
    if (category == null) {
      promise.reject(
        "invalid_notification_category",
        "Adhan volume category must be alarm, media, or notification",
      )
      return
    }

    stopPlayback()
    var player: MediaPlayer? = null
    try {
      val created = MediaPlayer()
      player = created
      created.setAudioAttributes(NotificationChannels.audioAttributes(category))
      created.setDataSource(
        context,
        Uri.parse(
          "${android.content.ContentResolver.SCHEME_ANDROID_RESOURCE}://${context.packageName}/${R.raw.adhan_full}",
        ),
      )
      created.prepare()
      created.setOnCompletionListener { completed ->
        synchronized(this) {
          if (adhanPlayer !== completed) return@setOnCompletionListener
          adhanPlayer = null
          completed.release()
        }
      }
      adhanPlayer = created
      created.start()
      promise.resolve(true)
    } catch (error: Exception) {
      if (adhanPlayer === player) {
        stopPlayback()
      } else {
        player?.release()
      }
      promise.reject("preview_playback_failed", "The full adhan preview could not be played", error)
    }
  }

  @ReactMethod
  fun stopAdhanPreview(promise: Promise) {
    stopPlayback()
    promise.resolve(null)
  }

  override fun onHostResume() = Unit

  override fun onHostPause() {
    stopPlayback()
  }

  override fun onHostDestroy() {
    stopPlayback()
  }

  private fun notificationPermissionStatus(): String {
    if (context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
      return "allowed"
    }
    val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
    return if (preferences.getBoolean(PERMISSION_REQUESTED_KEY, false)) {
      "blocked"
    } else {
      "notDetermined"
    }
  }

  private fun exactAlarmStatus(): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return "exact"
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager
    return try {
      if (alarmManager.canScheduleExactAlarms()) "exact" else "approximate"
    } catch (_: SecurityException) {
      "approximate"
    }
  }

  private fun batteryOptimizationStatus(): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return "notApplicable"
    val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    return if (powerManager.isIgnoringBatteryOptimizations(context.packageName)) {
      "unrestricted"
    } else {
      "restricted"
    }
  }

  private fun packageUri(): Uri = Uri.parse("package:${context.packageName}")

  private fun openSettingsIntent(intent: Intent, promise: Promise) {
    val activity = context.currentActivity
    if (activity == null) {
      promise.reject("unsupported", "Settings require an active activity")
      return
    }
    try {
      activity.startActivity(intent)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("unsupported", "The requested settings are unavailable", error)
    }
  }

  override fun invalidate() {
    context.removeLifecycleEventListener(this)
    permissionRequestInFlight = false
    stopPlayback()
    super.invalidate()
  }

  private fun parseNotification(item: ReadableMap?, index: Int, now: Long): StoredNotification {
    if (item == null ||
      !hasType(item, "id", ReadableType.String) ||
      !hasType(item, "title", ReadableType.String) ||
      !hasType(item, "body", ReadableType.String) ||
      !hasType(item, "at", ReadableType.Number) ||
      !hasType(item, "adhan", ReadableType.Boolean)
    ) {
      throw IllegalArgumentException(
        "Notification at index $index must contain id, title, body, at, and adhan with valid types",
      )
    }

    val id = item.getString("id").orEmpty()
    val title = item.getString("title").orEmpty()
    val body = item.getString("body").orEmpty()
    val timestamp = item.getDouble("at")
    if (id.isEmpty() || !timestamp.isFinite() || timestamp > Long.MAX_VALUE.toDouble()) {
      throw IllegalArgumentException("Notification at index $index contains an invalid id or timestamp")
    }

    val at = timestamp.toLong()
    val adhanVolumeCategory = if (!item.hasKey("adhanVolumeCategory")) {
      AdhanVolumeCategory.NOTIFICATION
    } else {
      if (!hasType(item, "adhanVolumeCategory", ReadableType.String)) {
        throw InvalidNotificationCategoryException(index)
      }
      AdhanVolumeCategory.fromValue(item.getString("adhanVolumeCategory").orEmpty())
        ?: throw InvalidNotificationCategoryException(index)
    }
    return StoredNotification(id, title, body, at, item.getBoolean("adhan"), adhanVolumeCategory)
  }

  private class InvalidNotificationCategoryException(index: Int) :
    IllegalArgumentException("Notification at index $index has an invalid adhanVolumeCategory")

  private fun hasType(item: ReadableMap, key: String, type: ReadableType): Boolean =
    item.hasKey(key) && !item.isNull(key) && item.getType(key) == type

  private fun stopPlayback() {
    synchronized(this) {
      adhanPlayer?.run {
        try {
          stop()
        } catch (_: IllegalStateException) {
          // The player may already have completed and released.
        }
        release()
      }
      adhanPlayer = null
    }
  }

  companion object {
    const val NAME = "DuavaraNotifications"
    private const val MAX_NOTIFICATIONS = 50
    private const val NOTIFICATION_PREFIX = "duavara-"
    private const val PERMISSION_REQUEST_CODE = 4817
    private const val PREFERENCES_NAME = "duavara_notifications"
    private const val PERMISSION_REQUESTED_KEY = "post_notifications_requested"
  }
}
