# Duavara

Duavara is a free React Native companion for daily Muslim prayer and worship. It calculates local prayer times from your location, shows the next prayer and Hijri date, provides Qibla guidance, and keeps selected worship progress on the device.

Released under the [Apache License 2.0](LICENSE). See [CONTRIBUTING.md](CONTRIBUTING.md) to help improve the app. Read the current local privacy disclosure in [PRIVACY.md](PRIVACY.md).

## Free to use

Duavara has no subscription, in-app purchases, paid account, or API key requirement. Its network features use publicly accessible services, including AlAdhan, AlQuran.cloud, and OpenStreetMap's Overpass API. Those services are operated independently and may apply their own availability, usage, or attribution terms.

## What the app currently includes

- **Today:** Fajr, Dhuhr, Asr, Maghrib, and Isha times, next-prayer countdown, current-prayer status, Hijri date, and sharing for today's timetable.
- **Prayer accuracy and travel:** named Home, Work, Mosque, Travel, and custom location profiles; optional IANA timezone override, high-latitude rule, and per-prayer minute tuning. Each profile caches up to 30 days of schedules for offline use; the next seven days are used for native reminders.
- **Qibla:** a bearing from true north, a live device-compass overlay when supported, and an optional camera view. The camera view is not required for the regular bearing.
- **Fasting:** Monday/Thursday or alternating-day Dawud routines, Ramadan status when the returned Hijri date is in Ramadan, and optional Suhoor/Imsak reminders.
- **Worship companion:** mark each daily prayer as prayed, view the current streak, and use a persistent Tasbih counter with 33 or 99 targets.
- **Discover:** the next Hijri occasion, Islamic months, special days, and a daily reflection from the 99 Names.
- **Quran:** Arabic Uthmani text by surah, selectable API-provided translations, translation search, bookmarks, saved reading progress, per-ayah streamed or user-downloaded recitation, adjustable Arabic/translation type sizes, light/dark reading surfaces, RTL-aware translations, and TalkBack labels. Quran content loads only when the reader is opened.
- **Nearby mosques:** search OpenStreetMap for Muslim places of worship within 5 km of the active location; save favourites, record local prayer notes, and open free OpenStreetMap directions.
- **Zakat calculator:** calculate locally from user-entered cash, metals, business assets, debts, and selected gold or silver Nisab. Prices are entered manually; no market prices are fetched.
- **Android home-screen widget:** show upcoming prayer times on Android. The widget is not implemented for iOS.

## Store release requirements

Before a store release:

1. Commit and publish [`PRIVACY.md`](PRIVACY.md) unchanged or substantially unchanged at a stable public HTTPS URL (for example, the `main` branch of `https://github.com/ivanarifin/Duavara`, a project website, or a repository-owned Pages site). Use that exact URL as the Apple App Store privacy policy URL and Google Play privacy policy URL; a local repository path is not a publishable URL.
2. Register the Android application ID and the `id.vandev.duavara` iOS bundle ID in the relevant developer accounts.
3. Configure production signing outside CI. The CI workflow creates a disposable key only to prove that release artifacts can be signed; it must never be used for store uploads.
4. Complete the Apple App Privacy and Google Play Data safety declarations using the disclosures in [`PRIVACY.md`](PRIVACY.md), then review the generated store previews before submission.

No store-console configuration or submission is performed by this repository's scripts.

## Requirements

- Node.js `>= 22.13.0` (from `package.json`)
- Android development environment for Android builds, including Android SDK/NDK support for the versions configured in `android/build.gradle`:
  - compile SDK `37`
  - target SDK `36`
  - minimum SDK `24`
  - NDK `27.1.12297006`
  - Gradle `9.4.1` via the checked-in wrapper
- macOS with Xcode and CocoaPods for iOS builds
- iOS deployment target `15.1`
- A physical device or emulator/simulator. A device with a compass is needed for live Qibla orientation; a camera is only needed for the optional camera view.

Complete the official [React Native environment setup](https://reactnative.dev/docs/set-up-your-environment) for the platform you want to run before continuing.

## Install dependencies

From the repository root:

```sh
npm ci
```

For iOS, install the Ruby-managed CocoaPods dependencies after the first clone and whenever native dependencies change:

```sh
bundle install
bundle exec pod install --project-directory=ios
```

The repository's `Gemfile` pins compatible CocoaPods-related gems. If your CocoaPods workflow is already configured, `bundle exec pod install` from `ios/` is equivalent.

## Run the app

### Start Metro

In one terminal:

```sh
npm start
```

Keep Metro running while using a debug build.

### Android

With an Android emulator running or an Android device connected:

```sh
npm run android
```

Android requests location access for device-based prayer times and true-north Qibla orientation. Notification access is requested when reminders are enabled. Camera access is optional and is requested only after opening the camera Qibla view.

### iOS

After installing Pods:

```sh
npm run ios
```

The default target is the iOS Simulator. To choose a simulator or device, use the React Native CLI options or open `ios/Duavara.xcworkspace` in Xcode. iOS requests location access while the app is in use and camera access only for the optional camera Qibla view.

## First-use setup

1. Open **Prayer settings** from the top-right menu.
2. Set a location by allowing device location, or enter decimal latitude and longitude manually. Manual coordinates are useful when you do not want to grant location access.
3. Save it as **Home**, **Work**, **Mosque**, **Travel**, or a custom place. Optionally add an IANA timezone, high-latitude rule, or local minute adjustments when your masjid timetable differs.
4. Choose an AlAdhan calculation method and the Asr juristic method (**Standard** or **Hanafi**).
5. Optionally enable 24-hour time, prayer reminders, Adhan sound, and individual prayer alerts. Review **Notification health** to check permission, exact timing, and Android battery restrictions.

Settings, saved places, up to 30 days of per-place prayer schedules, worship records, Tasbih count, mosque favourites, Quran reading preferences, and Zakat form are stored locally with AsyncStorage. The app restores a matching saved profile timetable while offline, then refreshes it when a network connection is available.

## Configuration and data sources

There is no `.env` file, backend, API key, or project-specific runtime configuration required by the current app. The app uses these free-to-access public HTTPS services:

- [AlAdhan API](https://aladhan.com/prayer-times-api) for prayer timings, monthly calendars, calculation methods, Qibla bearings, Hijri occasions, Islamic months, special days, and the 99 Names.
- [AlQuran.cloud](https://alquran.cloud/api) for the surah list, Arabic Uthmani Quran text, selectable translations, translation search, and API-provided recitation streams. The reader identifies the active translator and reciter.
- [OpenStreetMap Overpass API](https://overpass-api.de/) for nearby mosque search. The app displays OpenStreetMap attribution in the results section.
- The Android or iOS platform geocoder for a best-effort nearby-region label in the header. It may use the platform's network-backed provider.

Network-backed screens show an error and can be retried if a service is unavailable. Prayer times and Qibla require coordinates; Quran and Discover load their data when opened. The Zakat calculator and worship progress do not require a network connection after the app is installed.

Calculation results are estimates based on the selected method and coordinates. Local mosque timetables or local moon-sighting decisions may differ. Ramadan dates shown by the API can differ from local moon sighting.

## Useful scripts

| Command                      | Purpose                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| `npm start`                  | Start Metro.                                                                           |
| `npm run android`            | Build and run the Android debug app.                                                   |
| `npm run ios`                | Build and run the iOS debug app.                                                       |
| `npm test`                   | Run the Jest test suite.                                                               |
| `npm run lint`               | Run ESLint.                                                                            |
| `npm run bundle:apk`         | Build a release APK and copy it to `dist/<package-name>-<version>.apk`.                |
| `npm run bundle:aab`         | Build a release Android App Bundle and copy it to `dist/<package-name>-<version>.aab`. |
| `npm run version:check`      | Verify package, iOS, and Android release versions are aligned.                         |
| `npm run audit:dependencies` | Fail on unapproved dependency advisories.                                              |

`npm run version:check -- --ios-build-number 7 --android-build-code 7` validates positive release build numbers without editing native files. The equivalent environment variables are `DUAVARA_IOS_BUILD_NUMBER` and `DUAVARA_VERSION_CODE` (or `DUAVARA_ANDROID_BUILD_CODE`). Android bundle commands accept `--version-code <positive-integer>` and pass it to Gradle.

Release artifacts must be signed. On macOS, Gradle can use `android/app/duavara-upload.jks` and the `Duavara Android Upload Keystore` Keychain entry; protected release environments must provide `DUAVARA_UPLOAD_STORE_FILE`, `DUAVARA_UPLOAD_STORE_PASSWORD`, `DUAVARA_UPLOAD_KEY_ALIAS`, and `DUAVARA_UPLOAD_KEY_PASSWORD`. Never commit a keystore or its passwords. The `dist/` directory is ignored by Git.

## Native permissions and platform notes

- **Location:** used for device-based prayer times, Qibla bearing, nearby mosques, true-north compass orientation, and a best-effort region label. Manual coordinates can be used without location permission; selected manual and saved coordinates may still be sent to the platform geocoder to resolve that label.
- **Notifications:** used for prayer reminders and optional fasting alarms. Up to the next seven days are scheduled. Notification health reports the current OS permission and, on Android where available, exact-alarm and battery-optimization status; Focus, Do Not Disturb, and system settings may still affect delivery.
- **Camera:** optional; used only by the live camera Qibla finder. The normal Qibla bearing remains available without it.
- **Local storage:** stores preferences, saved places, per-place 30-day caches, worship progress, Tasbih state, mosque favourites/notes, Quran reading preferences, and Zakat form data on the device. No app backend or analytics service is configured.
- **Audio:** the Adhan preview and notification sound use bundled CC0 audio. Quran recitation streams from AlQuran.cloud; an ayah is stored locally only after the user explicitly downloads it. Sources and license details are recorded in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Release and rollback

1. Choose a new semantic version and positive, never-reused iOS build number and Android `versionCode`; run `npm run version:check -- --ios-build-number <ios-build> --android-build-code <android-build-code>`.
2. Run `npm ci`, `npm run audit:dependencies`, `npm run typecheck`, `npm run lint`, and `npm test -- --runInBand`. The audit currently documents two unpatched `image-size` build-tool advisories for ICNS/JXL/HEIF parsing; Metro does not accept those formats as app assets. Reassess this exception whenever Metro or `image-size` updates.
3. Commit the reviewed release candidate, then in a protected release environment set the four `DUAVARA_UPLOAD_*` variables and run `DUAVARA_VERSION_CODE=<android-build-code> npm run bundle:aab`. The script rejects dirty working trees so artifact metadata always identifies the committed source. Keep the AAB, checksum, metadata, and signing provenance together. Validate the published artifact with `apksigner verify` (APK) or `jarsigner -verify` (AAB; the command must report `jar verified`).
4. Archive and export iOS with the chosen positive build number using the production signing identity; pass `CURRENT_PROJECT_VERSION=<ios-build>` to the archive command, then upload artifacts through the store consoles only after reviewing the privacy URL and data disclosures.

For rollback, stop or halt the affected rollout in the store console, identify the last known-good immutable artifact and metadata, and use the store's supported rollback or staged-rollout controls. Do not reuse a build number; if a fix is needed, increment both platform build numbers, rerun validation, and release a new artifact.

## Testing and troubleshooting

Run the focused checks from the repository root:

```sh
npm test -- --runInBand
npm run lint
```

If prayer data does not appear, select or refresh a saved place and check network access to the AlAdhan API. If only cached data is available, the app displays up to 30 saved days for the active place and offers pull-to-refresh. If reminders show **Unavailable** after a rename or native-code update, reinstall the current Duavara APK—Metro reloads cannot update Kotlin modules—then enable notification permission; on Android, exact-alarm or battery settings may also be relevant. Nearby mosque search retries a second public Overpass service if the first is busy; VPNs, captive portals, or offline connections can still prevent both services from responding. If live compass guidance is unavailable, use the displayed Qibla bearing or calibrate/move the device away from metal and magnets.

For iOS native changes, reinstall Pods with `bundle exec pod install --project-directory=ios`. For Android native changes, a clean rebuild may be needed from Android Studio or with Gradle.

## Project structure

- `App.tsx` — app shell, tabs, settings, and screen composition.
- `src/domain/` — prayer, fasting, worship, and Quran-related data rules.
- `src/services/` — API clients, location, local storage, notifications, compass, mosque search, and Android widget integration.
- `src/components/` — Quran reader, Ramadan dashboard, mosque search, Qibla camera, worship companion, and Zakat calculator.
- `android/` and `ios/` — native application projects and native notification, compass, and widget integrations.
- `__tests__/` — Jest tests for domain rules and native-facing service behavior.
