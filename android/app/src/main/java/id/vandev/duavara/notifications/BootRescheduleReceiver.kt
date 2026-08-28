package id.vandev.duavara.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootRescheduleReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    when (intent?.action) {
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_DATE_CHANGED,
      ACTION_TIME_SET,
      Intent.ACTION_TIMEZONE_CHANGED -> PrayerAlarmReceiver.reschedule(context)
    }
  }

  private companion object {
    const val ACTION_TIME_SET = "android.intent.action.TIME_SET"
  }
}
