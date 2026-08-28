package id.vandev.duavara.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
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
    scheduleRefresh(context)
  }

  override fun onEnabled(context: Context) {
    renderAll(context)
    scheduleRefresh(context)
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
        renderAll(context)
        scheduleRefresh(context)
      }
    }
  }

  companion object {

    fun refresh(context: Context) {
      renderAll(context)
      scheduleRefresh(context)
    }

    private fun renderAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(
        ComponentName(context, NextPrayerWidgetProvider::class.java),
      )
      if (ids.isNotEmpty()) render(context, manager, ids)
    }

    private fun render(
      context: Context,
      manager: AppWidgetManager,
      ids: IntArray,
    ) {
      val nextPrayer = PrayerWidgetStore.nextPrayer(context)
      val views = RemoteViews(context.packageName, R.layout.widget_next_prayer)
      views.setOnClickPendingIntent(R.id.widget_root, appPendingIntent(context))
      views.setTextViewText(R.id.widget_label, "NEXT PRAYER")
      views.setTextViewText(
        R.id.widget_location,
        PrayerWidgetStore.locationLabel(context) ?: "Set location in Duavara",
      )

      if (nextPrayer == null) {
        views.setTextViewText(R.id.widget_prayer_name, "Open Duavara")
        views.setTextViewText(R.id.widget_prayer_time, "Refresh")
      } else {
        views.setTextViewText(R.id.widget_prayer_name, nextPrayer.name)
        views.setTextViewText(R.id.widget_prayer_time, nextPrayer.time)
      }
      manager.updateAppWidget(ids, views)
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
