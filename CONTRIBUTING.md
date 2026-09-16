# Contributing to Duavara

Thanks for helping improve Duavara. Contributions should keep the app reliable, privacy-conscious, and usable on both supported mobile platforms.

## Development flow

### 1. Fork and clone

Fork the repository on GitHub, then clone your fork and enter the project directory:

```sh
git clone https://github.com/<your-account>/Duavara.git
cd Duavara
```

Add the upstream repository so you can keep your fork current:

```sh
git remote add upstream https://github.com/<maintainer>/Duavara.git
git fetch upstream
```

### 2. Create a branch

Start from the current default branch and use a short, descriptive branch name:

```sh
git switch main
git pull --ff-only upstream main
git switch -c fix/short-description
```

Use a `feat/`, `fix/`, `docs/`, `test/`, or similarly clear prefix when useful.

### 3. Install dependencies

Duavara requires Node.js `>= 22.13.0`. From the repository root, install JavaScript dependencies with the lockfile:

```sh
npm install
```

`npm install` enables the Husky pre-commit hook, which runs `npm run lint:staged` for staged JavaScript and TypeScript files. Run tests before opening a pull request; the hook intentionally does not run the full test suite so commits stay quick.

For iOS development, use macOS with Xcode and CocoaPods, then install the Ruby-managed native dependencies after cloning and whenever native dependencies change:

```sh
bundle install
bundle exec pod install --project-directory=ios
```

Android development requires the Android SDK/NDK versions configured in `android/build.gradle` (compile SDK `36`, target SDK `36`, minimum SDK `24`, and NDK `27.1.12297006`). iOS builds use deployment target `15.1`. Complete the official [React Native environment setup](https://reactnative.dev/docs/set-up-your-environment) for the platform you will run.

### 4. Run checks

Run both focused checks from the repository root before opening a pull request:

```sh
npm test -- --runInBand
npm run lint
```

Run the app on a platform when your change affects native behavior or platform-specific UI:

```sh
npm start
npm run android
npm run ios
```

Keep Metro running while using a debug build. iOS requires Pods to be installed first. A physical device or emulator/simulator is sufficient for most work; live Qibla orientation requires a device with a compass, and the optional camera Qibla view requires a camera.

### 5. Open a pull request

Repository owners may push a pull-request branch to `ivanarifin/Duavara` and open a pull request against `main`. Other contributors must push a branch to a personal fork, then open a pull request against the upstream `main` branch; CI rejects non-owner pull requests whose source branch belongs to the upstream repository. Explain the user-visible change, implementation notes, and how you tested it. Keep each pull request focused; split unrelated fixes into separate pull requests.

## App-specific considerations

### Native platforms and permissions

Duavara has Android and iOS projects under `android/` and `ios/`. When changing native code, manifests, entitlements, notification behavior, compass integration, widgets, audio, or native dependencies:

- Consider and test the affected platform separately; the Android home-screen widget is not implemented for iOS.
- Reinstall iOS Pods with `bundle exec pod install --project-directory=ios` after iOS native dependency changes. Android native changes may require a clean rebuild.
- Request only the permission needed for the feature and preserve the existing optional behavior. Location supports device-based prayer times, Qibla, nearby mosques, and true-north orientation; manual coordinates remain available without location permission.
- Notifications are used for prayer reminders and optional fasting alarms. Camera access is only for the optional camera Qibla view; the regular Qibla bearing must continue to work without it.
- Release signing is mandatory. On macOS, the local `duavara-upload.jks` and Keychain entry are used automatically; protected CI/release environments must provide the documented `DUAVARA_UPLOAD_*` variables.

### Privacy and data sources

There is no app backend, analytics service, `.env` file, API key, or project-specific runtime configuration. Settings, the cached current schedule, worship records, Tasbih state, and Zakat form data are stored locally with AsyncStorage.

Network-backed features use public services independently operated by their providers:

- AlAdhan for prayer times, Qibla bearings, Hijri data, and related Islamic content.
- AlQuran.cloud for the surah list and Arabic Uthmani Quran text.
- OpenStreetMap Overpass for nearby mosque search; retain OpenStreetMap attribution in relevant UI.

Avoid adding telemetry or collecting personal data without an explicit product and privacy decision. If a change adds or alters a network request, document what data is sent, why it is needed, how failures are handled, and any required attribution or license information. Keep locally usable features such as worship progress and Zakat calculations functional without a network where practical.

### Licensing and third-party material

Only submit original work or code, dependencies, APIs, fonts, images, audio, and other assets that are freely redistributable and compatible with Duavara's [Apache License 2.0](LICENSE). Before adding third-party material, verify its license and usage terms. Do not add proprietary, source-available-only, unlicensed, or attribution-required material unless its terms permit this project to use and distribute it and the maintainer has approved it.

Record the source, license, required attribution, and any required notices for third-party assets in `THIRD_PARTY_NOTICES.md`; retain required in-app attribution for data sources. By submitting a pull request, you agree that your contribution is available under the Apache License 2.0.

### Tests and documentation

Add or update focused Jest coverage in `__tests__/` for domain rules and native-facing service behavior when behavior changes. For UI or native changes, include the device, emulator, or simulator platform you tested and note any permission or hardware limitations in the pull request.

Update contributor or user-facing documentation when commands, platform requirements, permissions, data sources, behavior, or troubleshooting steps change. If you add or modify bundled audio or other third-party assets, record the source and license in `THIRD_PARTY_NOTICES.md`.

## Pull request expectations

Before requesting review, confirm that the pull request:

- Changes only the files needed for the stated goal and includes tests or a clear reason tests are not applicable.
- Passes `npm test -- --runInBand` and `npm run lint`.
- Describes Android/iOS validation and permission behavior when relevant.
- Includes documentation, attribution, privacy details, and license/source details for user-visible, data-source, or third-party-material changes.
- Contains only original or Apache-2.0-compatible material that is free to redistribute; required third-party notices are recorded.
- Does not include secrets, generated build output, local configuration, or unrelated formatting changes.

Maintainers may ask for a smaller scope, additional platform validation, or follow-up tests before merging.
