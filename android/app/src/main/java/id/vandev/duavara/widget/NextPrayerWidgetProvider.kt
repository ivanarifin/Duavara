package id.vandev.duavara.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.widget.RemoteViews
import id.vandev.duavara.MainActivity
import id.vandev.duavara.R

class NextPrayerWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    render(context, appWidgetManager, appWidgetIds)
    if (appWidgetIds.isNotEmpty()) scheduleRefresh(context)
  }

  override fun onAppWidgetOptionsChanged(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetId: Int,
    newOptions: Bundle,
  ) {
    render(context, appWidgetManager, intArrayOf(appWidgetId))
  }

  override fun onEnabled(context: Context) {
    if (renderAll(context)) scheduleRefresh(context)
  }

  override fun onDisabled(context: Context) {
    alarmManager(context).cancel(refreshPendingIntent(context))
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_DATE_CHANGED,
      Intent.ACTION_TIME_CHANGED,
      Intent.ACTION_TIMEZONE_CHANGED -> {
        if (renderAll(context)) {
          scheduleRefresh(context)
        } else {
          alarmManager(context).cancel(refreshPendingIntent(context))
        }
      }
    }
  }

  companion object {

    fun refresh(context: Context) {
      if (renderAll(context)) {
        scheduleRefresh(context)
      } else {
        alarmManager(context).cancel(refreshPendingIntent(context))
      }
    }

    private fun renderAll(context: Context): Boolean {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(
        ComponentName(context, NextPrayerWidgetProvider::class.java),
      )
      if (ids.isEmpty()) return false
      render(context, manager, ids)
      return true
    }

    private fun render(
      context: Context,
      manager: AppWidgetManager,
      ids: IntArray,
    ) {
      val nextPrayer = PrayerWidgetStore.nextPrayer(context)
      val location = PrayerWidgetStore.locationLabel(context) ?: "Set location in Duavara"
      ids.forEach { id ->
        manager.updateAppWidget(
          id,
          createViews(
            context,
            widgetSize(manager.getAppWidgetOptions(id)),
            nextPrayer,
            location,
          ),
        )
      }
    }

    private fun createViews(
      context: Context,
      size: WidgetSize,
      nextPrayer: WidgetPrayer?,
      location: String,
    ): RemoteViews {
      val views = RemoteViews(context.packageName, size.layoutResource)
      views.setOnClickPendingIntent(R.id.widget_root, appPendingIntent(context))
      views.setTextViewText(R.id.widget_label, "NEXT PRAYER")
      views.setTextViewText(R.id.widget_location, location)
      if (nextPrayer == null) {
        views.setTextViewText(R.id.widget_prayer_name, "Open Duavara")
        views.setTextViewText(R.id.widget_prayer_time, "Refresh")
      } else {
        views.setTextViewText(R.id.widget_prayer_name, nextPrayer.name)
        views.setTextViewText(R.id.widget_prayer_time, nextPrayer.time)
      }
      return views
    }

    private fun widgetSize(options: Bundle): WidgetSize {
      val width = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0)
      val height = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0)
      return when {
        width >= STANDARD_WIDTH_DP && height >= EXPANDED_HEIGHT_DP -> WidgetSize.EXPANDED
        width >= STANDARD_WIDTH_DP && height >= STANDARD_HEIGHT_DP -> WidgetSize.STANDARD
        else -> WidgetSize.COMPACT
      }
    }

    private enum class WidgetSize(val layoutResource: Int) {
      COMPACT(R.layout.widget_next_prayer_compact),
      STANDARD(R.layout.widget_next_prayer),
      EXPANDED(R.layout.widget_next_prayer_expanded),
    }

    private fun scheduleRefresh(context: Context) {
      val manager = alarmManager(context)
      manager.cancel(refreshPendingIntent(context))
      val nextPrayer = PrayerWidgetStore.nextPrayer(context) ?: return
      val pendingIntent = refreshPendingIntent(context)

      val canUseExactAlarm =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.S || manager.canScheduleExactAlarms()
      if (canUseExactAlarm) {
        manager.setExactAndAllowWhileIdle(
          AlarmManager.RTC_WAKEUP,
          nextPrayer.at,
          pendingIntent,
        )
      } else {
        // ponytail: platform may defer inexact alarms; enable Alarms & reminders for exact transitions.
        manager.setAndAllowWhileIdle(
          AlarmManager.RTC_WAKEUP,
          nextPrayer.at,
          pendingIntent,
        )
      }
    }

    private fun alarmManager(context: Context): AlarmManager =
      context.getSystemService(AlarmManager::class.java)

    private fun refreshPendingIntent(context: Context): PendingIntent =
      PendingIntent.getBroadcast(
        context,
        2048,
        Intent(context, WidgetRefreshReceiver::class.java),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )

    private const val STANDARD_WIDTH_DP = 270
    private const val STANDARD_HEIGHT_DP = 144
    private const val EXPANDED_HEIGHT_DP = 180

    private fun appPendingIntent(context: Context): PendingIntent =
      PendingIntent.getActivity(
        context,
        2049,
        Intent(context, MainActivity::class.java).apply {
          flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        },
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
  }
}
