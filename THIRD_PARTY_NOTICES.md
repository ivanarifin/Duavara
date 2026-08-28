# Third-party notices

## Adhan notification audio

`android/app/src/main/res/raw/adhan_full.mp3`, `ios/Duavara/Audio/adhan_full.m4a`, `android/app/src/main/res/raw/adhan_short.mp3`, and `ios/Duavara/Audio/adhan_short.caf` are derived from **“Beautiful adhan.ogg”** by **Adam-synagda**.

- Source: https://commons.wikimedia.org/wiki/File:Beautiful_adhan.ogg
- License: CC0 1.0 Universal (Public Domain Dedication)
- Source recording duration: 154 seconds
- This app distributes a normalized 28-second excerpt so it can be used as an iOS local-notification sound, which must be under 30 seconds.

CC0 does not require attribution. This notice records the source and provenance.

## Quran network data and streaming recitation

Duavara retrieves—not bundles—the Quran text, translations, edition metadata, and on-demand recitation from **AlQuran.cloud / Islamic Network**.

- API: https://alquran.cloud/api
- Terms: https://alquran.cloud/terms-and-conditions
- Arabic edition: `quran-uthmani`
- Translations: Duavara displays the API-provided translator/edition name in the reader.
- Recitations: Duavara displays the selected reciter and streams from the API-provided HTTPS URL. User-requested ayah downloads are stored only in the app's private document directory.

AlQuran.cloud's terms require preservation of the Uthmani text and attribution to translators. Recitation copyrights remain with the respective reciters; Duavara does not bundle a recitation catalog into the app.

## Quran playback and download libraries

- `react-native-sound` 0.13.0 — https://github.com/zmxv/react-native-sound — MIT License.
- `react-native-fs` 2.20.0 — https://github.com/itinance/react-native-fs — MIT License.

These libraries provide on-device playback and private-document-directory downloads for user-selected Quran recitations.

## OpenStreetMap directions

Saved-mosque directions open an external OpenStreetMap URL. Duavara does not bundle map tiles or use a paid map SDK. Nearby mosque data and directions remain subject to OpenStreetMap attribution and the relevant external service terms.
