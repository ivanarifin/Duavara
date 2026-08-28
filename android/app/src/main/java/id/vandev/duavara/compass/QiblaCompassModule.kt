package id.vandev.duavara.compass

import android.content.Context
import android.hardware.GeomagneticField
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.SystemClock
import android.view.Surface
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class QiblaCompassModule(
  private val context: ReactApplicationContext,
) : ReactContextBaseJavaModule(context), SensorEventListener {
  private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
  private val rotationVectorSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
  private val accelerometerSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
  private val magneticFieldSensor = sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)
  private var accelerometerValues: FloatArray? = null
  private var magneticFieldValues: FloatArray? = null
  private var geomagneticField: GeomagneticField? = null
  private var isRunning = false
  private var lastEmissionTimestamp = 0L

  override fun getName(): String = NAME

  @ReactMethod
  fun start(options: ReadableMap, promise: Promise) {
    if (isRunning) {
      promise.resolve(Arguments.createMap().apply { putString("north", "true") })
      return
    }

    try {
      val latitude = options.requiredFiniteNumber("latitude")
      val longitude = options.requiredFiniteNumber("longitude")
      val altitude = if (options.hasKey("altitude") && !options.isNull("altitude")) {
        options.getDouble("altitude").toFloat()
      } else {
        0f
      }
      if (latitude !in -90.0..90.0 || longitude !in -180.0..180.0) {
        promise.reject("INVALID_COORDINATES", "Valid coordinates are required for true-north Qibla")
        return
      }
      if (rotationVectorSensor == null && (accelerometerSensor == null || magneticFieldSensor == null)) {
        promise.reject("COMPASS_UNSUPPORTED", "This device does not have a usable compass sensor")
        return
      }

      geomagneticField = GeomagneticField(
        latitude.toFloat(),
        longitude.toFloat(),
        altitude,
        System.currentTimeMillis(),
      )
      isRunning = true
      lastEmissionTimestamp = 0L
      if (rotationVectorSensor != null) {
        sensorManager.registerListener(this, rotationVectorSensor, SensorManager.SENSOR_DELAY_GAME)
      } else {
        sensorManager.registerListener(this, accelerometerSensor, SensorManager.SENSOR_DELAY_GAME)
        sensorManager.registerListener(this, magneticFieldSensor, SensorManager.SENSOR_DELAY_GAME)
      }
      promise.resolve(Arguments.createMap().apply { putString("north", "true") })
    } catch (error: IllegalArgumentException) {
      promise.reject("INVALID_COORDINATES", error.message, error)
    } catch (error: Exception) {
      stopSensors()
      promise.reject("COMPASS_START_FAILED", "Unable to start the Qibla compass", error)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    stopSensors()
    promise.resolve(null)
  }

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Double) = Unit

  override fun onSensorChanged(event: SensorEvent) {
    if (!isRunning || event.accuracy == SensorManager.SENSOR_STATUS_UNRELIABLE) return
    val rotationMatrix = FloatArray(9)
    when (event.sensor.type) {
      Sensor.TYPE_ROTATION_VECTOR -> {
        SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values)
        emitHeading(rotationMatrix, event.accuracy)
      }
      Sensor.TYPE_ACCELEROMETER -> {
        accelerometerValues = event.values.clone()
        emitFallbackHeading(event.accuracy, rotationMatrix)
      }
      Sensor.TYPE_MAGNETIC_FIELD -> {
        magneticFieldValues = event.values.clone()
        emitFallbackHeading(event.accuracy, rotationMatrix)
      }
    }
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

  override fun onCatalystInstanceDestroy() {
    stopSensors()
    super.onCatalystInstanceDestroy()
  }

  private fun emitFallbackHeading(sensorAccuracy: Int, rotationMatrix: FloatArray) {
    val gravity = accelerometerValues ?: return
    val magnetic = magneticFieldValues ?: return
    if (SensorManager.getRotationMatrix(rotationMatrix, null, gravity, magnetic)) {
      emitHeading(rotationMatrix, sensorAccuracy)
    }
  }

  private fun emitHeading(rotationMatrix: FloatArray, sensorAccuracy: Int) {
    val now = SystemClock.elapsedRealtime()
    if (now - lastEmissionTimestamp < EMISSION_INTERVAL_MS) return
    lastEmissionTimestamp = now

    val remapped = FloatArray(9)
    val (axisX, axisY) = when (context.currentActivity?.windowManager?.defaultDisplay?.rotation ?: Surface.ROTATION_0) {
      Surface.ROTATION_90 -> SensorManager.AXIS_Y to SensorManager.AXIS_MINUS_X
      Surface.ROTATION_180 -> SensorManager.AXIS_MINUS_X to SensorManager.AXIS_MINUS_Y
      Surface.ROTATION_270 -> SensorManager.AXIS_MINUS_Y to SensorManager.AXIS_X
      else -> SensorManager.AXIS_X to SensorManager.AXIS_Y
    }
    if (!SensorManager.remapCoordinateSystem(rotationMatrix, axisX, axisY, remapped)) return

    val orientation = FloatArray(3)
    SensorManager.getOrientation(remapped, orientation)
    val magneticHeading = normalize(Math.toDegrees(orientation[0].toDouble()).toFloat())
    val trueHeading = normalize(magneticHeading + (geomagneticField?.declination ?: 0f))
    val payload = Arguments.createMap().apply {
      putDouble("heading", trueHeading.toDouble())
      putDouble("accuracy", sensorAccuracy.toDouble())
      putString("north", "true")
      putDouble("timestamp", System.currentTimeMillis().toDouble())
    }
    context
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EVENT_NAME, payload)
  }

  private fun stopSensors() {
    if (!isRunning) return
    sensorManager.unregisterListener(this)
    isRunning = false
    accelerometerValues = null
    magneticFieldValues = null
    geomagneticField = null
  }

  private fun ReadableMap.requiredFiniteNumber(key: String): Double {
    if (!hasKey(key) || isNull(key)) throw IllegalArgumentException("$key is required")
    val value = getDouble(key)
    if (!value.isFinite()) throw IllegalArgumentException("$key must be finite")
    return value
  }

  private fun normalize(value: Float): Float {
    val normalized = value % 360f
    return if (normalized < 0f) normalized + 360f else normalized
  }

  companion object {
    const val NAME = "QiblaCompass"
    const val EVENT_NAME = "QiblaCompassHeading"
    private const val EMISSION_INTERVAL_MS = 75L
  }
}
