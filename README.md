# Daily Intake Calculator

A Capacitor Android app for food logging and calorie estimates.

## Automatic steps

1. Install/update Health Connect on a supported Android phone. It is built into Android 14 and newer.
2. In Google Fit, Samsung Health, or another step-recording app, enable sharing steps with Health Connect.
3. In Daily Intake Calculator, tap the TDEE/body-stats row, choose **Automatic step source → Samsung Health**, then **Connect automatic steps** and allow step access.

Steps sync on app startup, every minute while the app is visible, when returning to it, and when viewing another date. Permission is requested only when you tap Connect. Step updates also update the walking-calorie and TDEE estimates. If you enter manual steps, the higher of the manual and phone totals is used, so they are not added twice.

Samsung Health is the default source. The native reader filters Health Connect by Samsung Health’s package (`com.sec.android.app.shealth`), so unrelated phone totals are not substituted. You can choose **Health Connect combined total** instead. Each source has its own saved readings; switching sources never adds their totals together. If Samsung has not exported watch steps to Health Connect, the app cannot read them directly from the watch and shows a no-data message.

Health Connect supplies recorded totals; this app does not count motion itself. With no recording app or permission, use manual steps. Empty readings and connection failures preserve saved totals. You can revoke access in Health Connect's app permissions. Step totals remain on the device and are included in exported backups. See [the bundled step-data notice](www/health-privacy.html).

## Development

Use Node 20, JDK 17, Python 3, and Android SDK 34/build-tools 34.0.0.

```sh
npm ci
npx cap add android # only if android/ does not exist
npm run build:android
npm test
cd android
./gradlew assembleDebug
```

`npm run build:android` syncs the web app and configures Health Connect permissions, its offline rationale, and the generated project's minimum SDK (26). The barcode-scanner setup and icon generation are also performed by `.github/workflows/build-apk.yml`; use that workflow for a complete distributable debug APK.

`npm test` covers automatic reads, permissions, concurrent refreshes, saved totals, invalid readings, and local-day boundaries. Actual Health Connect authorization and step import still require testing on a phone with a recording app. In a browser, manual entry works and the native connect button is hidden.

The pinned `capacitor-health@0.0.14` native source-filter patch in `patches/` is applied by `patch-package` during `npm ci`. Do not skip install scripts. Android builds verify the patched code compiles.
