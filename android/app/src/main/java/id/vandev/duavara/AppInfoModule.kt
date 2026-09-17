package id.vandev.duavara

import android.content.pm.PackageManager
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AppInfoModule(
  private val context: ReactApplicationContext,
) : ReactContextBaseJavaModule(context) {
  override fun getName(): String = NAME

  @ReactMethod
  fun getAppInfo(promise: Promise) {
    try {
      val packageInfo = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
        context.packageManager.getPackageInfo(
          context.packageName,
          PackageManager.PackageInfoFlags.of(0),
        )
      } else {
        @Suppress("DEPRECATION")
        context.packageManager.getPackageInfo(context.packageName, 0)
      }
      promise.resolve(
        Arguments.createMap().apply {
          putString("version", packageInfo.versionName ?: "Unavailable")
          val buildCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            packageInfo.longVersionCode
          } else {
            @Suppress("DEPRECATION")
            packageInfo.versionCode.toLong()
          }
          putString("build", buildCode.toString())
        },
      )
    } catch (error: PackageManager.NameNotFoundException) {
      promise.reject("app_info_unavailable", "Unable to read installed app information.", error)
    }
  }

  companion object {
    const val NAME = "DuavaraAppInfo"
  }
}
