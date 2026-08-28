package id.vandev.duavara.notifications

import android.annotation.TargetApi
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build

internal object PrayerAlarmScheduler {
  fun schedule(context: Context, notification: StoredNotification) {
    NotificationChannels.ensure(context)
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val pendingIntent = pendingIntent(context, notification.id)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && canScheduleExactAlarms(alarmManager)) {
      try {
        alarmManager.setExactAndAllowWhileIdle(
          AlarmManager.RTC_WAKEUP,
          notification.at,
          pendingIntent,
        )
        return
      } catch (_: SecurityException) {
        // Fall through to the permitted inexact alarm.
      }
    }

    alarmManager.setAndAllowWhileIdle(
      AlarmManager.RTC_WAKEUP,
      notification.at,
      pendingIntent,
    )
  }

  fun cancel(context: Context, id: String) {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val pendingIntent = pendingIntent(context, id)
    alarmManager.cancel(pendingIntent)
    pendingIntent.cancel()
  }

  @TargetApi(Build.VERSION_CODES.S)
  private fun canScheduleExactAlarms(alarmManager: AlarmManager): Boolean =
    try {
      alarmManager.canScheduleExactAlarms()
    } catch (_: SecurityException) {
      false
    }

  private fun pendingIntent(context: Context, id: String): PendingIntent {
    val intent = Intent(context, PrayerAlarmReceiver::class.java).apply {
      action = PrayerAlarmReceiver.ACTION_ALARM
      data = Uri.parse("duavara://notification/${Uri.encode(id)}")
      putExtra(PrayerAlarmReceiver.EXTRA_NOTIFICATION_ID, id)
    }
    return PendingIntent.getBroadcast(
      context,
      id.hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }
}
