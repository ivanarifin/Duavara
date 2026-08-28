package id.vandev.duavara.notifications

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

enum class AdhanVolumeCategory(val value: String) {
  ALARM("alarm"),
  MEDIA("media"),
  NOTIFICATION("notification");

  companion object {
    fun fromValue(value: String): AdhanVolumeCategory? =
      values().firstOrNull { it.value == value }

    fun fromStored(value: Any?): AdhanVolumeCategory =
      (value as? String)?.let(::fromValue) ?: NOTIFICATION
  }
}

data class StoredNotification(
  val id: String,
  val title: String,
  val body: String,
  val at: Long,
  val adhan: Boolean,
  val adhanVolumeCategory: AdhanVolumeCategory = AdhanVolumeCategory.NOTIFICATION,
)

internal object NotificationStore {
  private const val PREFERENCES = "duavara.notifications"
  private const val SCHEDULES_KEY = "schedules"

  @Synchronized
  fun load(context: Context): List<StoredNotification> {
    val raw = context
      .getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      .getString(SCHEDULES_KEY, null)
      ?: return emptyList()

    return try {
      val payload = JSONArray(raw)
      buildList {
        for (index in 0 until payload.length()) {
          val item = payload.optJSONObject(index) ?: continue
          val id = item.optString("id").trim()
          val title = item.optString("title")
          val body = item.optString("body")
          val at = item.optLong("at")
          if (id.isNotEmpty() && at > 0) {
            add(
              StoredNotification(
                id = id,
                title = title,
                body = body,
                at = at,
                adhan = item.optBoolean("adhan", false),
                adhanVolumeCategory = AdhanVolumeCategory.fromStored(item.opt("adhanVolumeCategory")),
              ),
            )
          }
        }
      }.distinctBy { it.id }
    } catch (_: Exception) {
      emptyList()
    }
  }

  @Synchronized
  fun replace(context: Context, notifications: List<StoredNotification>) {
    val payload = JSONArray()
    notifications.forEach { notification ->
      payload.put(
        JSONObject()
          .put("id", notification.id)
          .put("title", notification.title)
          .put("body", notification.body)
          .put("at", notification.at)
          .put("adhan", notification.adhan)
          .put("adhanVolumeCategory", notification.adhanVolumeCategory.value),
      )
    }
    context
      .getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      .edit()
      .putString(SCHEDULES_KEY, payload.toString())
      .apply()
  }
}
