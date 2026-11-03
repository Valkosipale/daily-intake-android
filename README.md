# Daily Intake Calculator

A Capacitor Android app for food logging and calorie estimates.

## Automatic steps

1. Install/update Health Connect on a supported Android phone. It is built into Android 14 and newer.
2. In Google Fit, Samsung Health, or another step-recording app, enable sharing steps with Health Connect. In Samsung Health, also enable consent to processing health and wellness data. Put Samsung Health first in Health Connect’s data-source priority to use its watch-inclusive total.
3. In Daily Intake Calculator, tap the TDEE/body-stats row, then **Connect automatic steps** and allow step access.

Steps sync on app startup, every minute while the app is visible, when returning to it, and when viewing another date. Permission is requested only when you tap Connect. Step updates also update the walking-calorie and TDEE estimates. If you enter manual steps, the higher of the manual and phone totals is used, so they are not added twice.

Health Connect supplies recorded totals; this app does not count motion itself. With no recording app or permission, use manual steps. Empty readings and connection failures preserve saved totals. You can revoke access in Health Connect's app permissions. Step totals remain on the device and are included in exported backups. See [the bundled step-data notice](www/health-privacy.html).

## Development

Use Node 20, JDK 17, Python 3, and Android SDK 34/build-tools 34.0.0.

```sh
npm install
npx cap add android # only if android/ does not exist
npm run build:android
npm test
cd android
./gradlew assembleDebug
```

`npm run build:android` syncs the web app and configures Health Connect permissions, its offline rationale, and the generated project's minimum SDK (26). The barcode-scanner setup and icon generation are also performed by `.github/workflows/build-apk.yml`; use that workflow for a complete distributable debug APK.

`npm test` covers automatic reads, permissions, concurrent refreshes, saved totals, invalid readings, and local-day boundaries. Actual Health Connect authorization and step import still require testing on a phone with a recording app. In a browser, manual entry works and the native connect button is hidden.

## Monthly review

Each day shows calories eaten, estimated TDEE, and recorded steps. TDEE uses the latest weigh-in on or before that day, daily gym activity, and the higher of saved manual and Health Connect steps. Days without food logs still show activity data. Missing body stats or step readings are labelled explicitly; a recorded zero remains zero. The review displays the daily readings already synced or saved, rather than inventing values for missing dates.
