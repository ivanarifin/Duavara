package id.vandev.duavara.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.media.AudioManager
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import id.vandev.duavara.R

class PrayerAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent?.action == ACTION_ALARM) {
      deliver(context, intent.getStringExtra(EXTRA_NOTIFICATION_ID))
    }
  }

  private fun deliver(context: Context, id: String?) {
    if (id.isNullOrEmpty()) return
    val notification = NotificationStore.load(context).firstOrNull { it.id == id } ?: return
    val category = if (notification.adhan) {
      notification.adhanVolumeCategory
    } else {
      AdhanVolumeCategory.NOTIFICATION
    }
    val sound = NotificationChannels.soundUri(context, notification.adhan)

    NotificationChannels.ensure(context)
    val builder = NotificationCompat.Builder(
      context,
      if (notification.adhan) NotificationChannels.channelId(category)
      else NotificationChannels.DEFAULT_CHANNEL_ID,
    )
      .setSmallIcon(R.drawable.ic_notification)
      .setContentTitle(notification.title)
      .setContentText(notification.body)
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setAutoCancel(true)

    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      builder.setSound(sound, NotificationChannels.streamType(category))
    }

    try {
      NotificationManagerCompat.from(context).notify(notification.id, 0, builder.build())
    } catch (_: SecurityException) {
      // Notification permission may have been revoked after scheduling.
    } finally {
      NotificationStore.replace(context, NotificationStore.load(context).filter { it.id != id })
    }
  }

  companion object {
    const val ACTION_ALARM = "id.vandev.duavara.action.PRAYER_ALARM"
    const val EXTRA_NOTIFICATION_ID = "notification_id"

    internal fun reschedule(context: Context) {
      val now = System.currentTimeMillis()
      val stored = NotificationStore.load(context)
      val future = stored.filter { it.at > now }
      stored.filter { it.at <= now }.forEach { PrayerAlarmScheduler.cancel(context, it.id) }
      if (future.size != stored.size) NotificationStore.replace(context, future)
      future.forEach { notification -> PrayerAlarmScheduler.schedule(context, notification) }
    }
  }
}

internal object NotificationChannels {
  private const val ADHAN_ALARM_CHANNEL_ID = "duavara-prayer-adhan-alarm-v1"
  private const val ADHAN_MEDIA_CHANNEL_ID = "duavara-prayer-adhan-media-v1"
  private const val ADHAN_NOTIFICATION_CHANNEL_ID = "duavara-prayer-adhan-notification-v1"
  const val DEFAULT_CHANNEL_ID = "duavara-prayer-default"

  fun ensure(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
    AdhanVolumeCategory.values().forEach { category ->
      if (manager.getNotificationChannel(channelId(category)) == null) {
        manager.createNotificationChannel(
          android.app.NotificationChannel(
            channelId(category),
            "Prayer with Adhan (${category.value})",
            android.app.NotificationManager.IMPORTANCE_DEFAULT,
          ).apply {
            setSound(soundUri(context, true), audioAttributes(category))
          },
        )
      }
    }
    if (manager.getNotificationChannel(DEFAULT_CHANNEL_ID) == null) {
      manager.createNotificationChannel(
        android.app.NotificationChannel(
          DEFAULT_CHANNEL_ID,
          "Prayer notifications",
          android.app.NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
          setSound(soundUri(context, false), notificationAudioAttributes())
        },
      )
    }
  }

  fun channelId(category: AdhanVolumeCategory): String = when (category) {
    AdhanVolumeCategory.ALARM -> ADHAN_ALARM_CHANNEL_ID
    AdhanVolumeCategory.MEDIA -> ADHAN_MEDIA_CHANNEL_ID
    AdhanVolumeCategory.NOTIFICATION -> ADHAN_NOTIFICATION_CHANNEL_ID
  }

  fun soundUri(context: Context, adhan: Boolean): Uri =
    if (adhan) {
      Uri.parse("${android.content.ContentResolver.SCHEME_ANDROID_RESOURCE}://${context.packageName}/${R.raw.adhan_short}")
    } else {
      RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
    }

  fun audioAttributes(category: AdhanVolumeCategory): AudioAttributes =
    AudioAttributes.Builder()
      .setUsage(
        when (category) {
          AdhanVolumeCategory.ALARM -> AudioAttributes.USAGE_ALARM
          AdhanVolumeCategory.MEDIA -> AudioAttributes.USAGE_MEDIA
          AdhanVolumeCategory.NOTIFICATION -> AudioAttributes.USAGE_NOTIFICATION
        },
      )
      .setContentType(
        when (category) {
          AdhanVolumeCategory.ALARM -> AudioAttributes.CONTENT_TYPE_SONIFICATION
          AdhanVolumeCategory.MEDIA -> AudioAttributes.CONTENT_TYPE_MUSIC
          AdhanVolumeCategory.NOTIFICATION -> AudioAttributes.CONTENT_TYPE_SONIFICATION
        },
      )
      .build()

  fun streamType(category: AdhanVolumeCategory): Int = when (category) {
    AdhanVolumeCategory.ALARM -> AudioManager.STREAM_ALARM
    AdhanVolumeCategory.MEDIA -> AudioManager.STREAM_MUSIC
    AdhanVolumeCategory.NOTIFICATION -> AudioManager.STREAM_NOTIFICATION
  }

  fun notificationAudioAttributes(): AudioAttributes = audioAttributes(AdhanVolumeCategory.NOTIFICATION)
}
