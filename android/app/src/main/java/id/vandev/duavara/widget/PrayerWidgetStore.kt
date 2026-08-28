package id.vandev.duavara.widget

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

data class WidgetPrayer(
  val name: String,
  val time: String,
  val at: Long,
)

object PrayerWidgetStore {
  private const val PREFERENCES = "duavara.widget"
  private const val SCHEDULE_KEY = "prayer_schedule"

  fun save(context: Context, prayers: List<WidgetPrayer>) {
    val payload = JSONArray()
    prayers.sortedBy { it.at }.forEach { prayer ->
      payload.put(
        JSONObject()
          .put("name", prayer.name)
          .put("time", prayer.time)
          .put("at", prayer.at),
      )
    }
    context
      .getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      .edit()
      .putString(SCHEDULE_KEY, payload.toString())
      .apply()
  }

  fun clear(context: Context) {
    context
      .getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      .edit()
      .remove(SCHEDULE_KEY)
      .apply()
  }

  fun load(context: Context): List<WidgetPrayer> {
    val raw = context
      .getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      .getString(SCHEDULE_KEY, null)
      ?: return emptyList()

    return try {
      val payload = JSONArray(raw)
      buildList {
        for (index in 0 until payload.length()) {
          val item = payload.optJSONObject(index) ?: continue
          val name = item.optString("name").trim()
          val time = item.optString("time").trim()
          val at = item.optLong("at")
          if (name.isNotEmpty() && time.isNotEmpty() && at > 0) {
            add(WidgetPrayer(name, time, at))
          }
        }
      }.distinctBy { it.at to it.name }.sortedBy { it.at }
    } catch (_: Exception) {
      emptyList()
    }
  }

  fun nextPrayer(context: Context, now: Long = System.currentTimeMillis()): WidgetPrayer? =
    load(context).firstOrNull { it.at > now }
}
