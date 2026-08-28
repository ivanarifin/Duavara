package id.vandev.duavara.location

import android.content.Context
import android.location.Address
import android.location.Geocoder
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.Locale

class DuavaraLocationModule(
  private val context: ReactApplicationContext,
) : ReactContextBaseJavaModule(context) {
  override fun getName(): String = NAME

  @ReactMethod
  fun reverseGeocode(latitude: Double, longitude: Double, promise: Promise) {
    if (!latitude.isFinite() || !longitude.isFinite() || latitude !in -90.0..90.0 || longitude !in -180.0..180.0) {
      promise.reject("INVALID_COORDINATES", "Valid coordinates are required")
      return
    }
    if (!Geocoder.isPresent()) {
      promise.resolve(null)
      return
    }

    try {
      val geocoder = Geocoder(context, Locale.getDefault())
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        geocoder.getFromLocation(
          latitude,
          longitude,
          1,
          object : Geocoder.GeocodeListener {
            override fun onGeocode(addresses: MutableList<Address>) {
              promise.resolve(regionName(addresses.firstOrNull()))
            }

            override fun onError(errorMessage: String?) {
              promise.resolve(null)
            }
          },
        )
      } else {
        @Suppress("DEPRECATION")
        promise.resolve(regionName(geocoder.getFromLocation(latitude, longitude, 1)?.firstOrNull()))
      }
    } catch (_: Exception) {
      promise.resolve(null)
    }
  }

  private fun regionName(address: Address?): String? = address?.let {
    listOfNotNull(it.subAdminArea, it.locality, it.adminArea)
      .firstOrNull { value -> value.isNotBlank() }
  }

  companion object {
    const val NAME = "DuavaraLocation"
  }
}
