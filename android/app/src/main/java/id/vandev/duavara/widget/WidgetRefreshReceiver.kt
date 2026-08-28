package id.vandev.duavara.widget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class WidgetRefreshReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    NextPrayerWidgetProvider.refresh(context)
  }
}
