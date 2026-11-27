# Local personalized TDEE

## Files and integration

- `www/tdee.js`: pure physiological model, robust trend, confidence and daily calibration. No UI, network or dependencies.
- `www/tdee-local.js`: existing localStorage adapter, additive migration, data eligibility, dated activity/profile observations, calibration persistence and historical snapshots.
- `www/index.html`: existing daily summary and Body stats panel, step/gym recording, local Health Connect completed-day refresh, week/month/year comparison and backup integration. Uses the existing design and controls; no calibration settings.
- `tests/tdee.test.cjs`: formulas, longitudinal data, missingness, robust trends, uncertainty, persistence, upgrade, backups and repeated launches.

## Existing data

The app has no SQL database. Food is stored at `dic:log:YYYY-MM-DD` as arrays with total calories/macros per logged item. Explicit zero-intake fasting markers are `dic:fasting:YYYY-MM-DD`. `dic:weightLog` contains dated kg readings, one per date. `dic:steps` stores manual and phone counts; the higher remains effective. `dic:gym` stores dated resistance-training minutes and intensity. `dic:profile` stores sex, age, height and weight.

These records remain intact. Explicit rest-day gym records now retain zero minutes instead of deleting their entry. Older backups remain supported. The new optional `tdee` backup field carries the new state; API keys are not exported. New state is stored only under `dic:tdee:v2`.

## Physiological formulas

All coefficients are internal constants. Calculation keeps precision until display rounding.

- Mifflin–St Jeor: `10 × kg + 6.25 × cm − 5 × years + 5` (male), or `− 161` (female).
- Baseline: `BMR × 1.20`. No additional thermic effect of food.
- Walking: `max(0, steps − 2000) × kg × 0.0004`.
- Resistance training: `(gross MET − 1) × 3.5 × kg / 200 × minutes`, with gross MET 3.5 / 4.5 / 6.0 for light / moderate / hard. Rest is subtracted once. Walking/cardio must not also be entered as gym resistance training.
- Uncalibrated estimate: baseline + walking + net resistance training.
- Personalized current/future estimate: uncalibrated estimate + active additive calibration offset.

BMR and activity costs use the latest weigh-in on or before the selected date (profile weight is the fallback). Current profile changes immediately affect new estimates. Historical observations retain the profile known on their date.

## Aligned observation window

Consider only the last 42 completed calendar dates; today and future records cannot affect calibration. UTC arithmetic is used on local calendar-date strings to avoid daylight-saving duration errors.

Find the longest continuous usable interval bounded by two actual weigh-ins. Require at least 28 intake/activity days and at least 6 distinct dated weigh-ins spanning at least 28 days. With multiple equal-length intervals, prefer the newest. All intake and uncalibrated expenditure averages cover precisely `[first weigh-in date, last weigh-in date)`. Weight dates are assumed to approximate morning readings, so the last weight is the endpoint for the preceding intake days. Within 42 completed dates, the longest bounded energy-balance interval is 41 days. There is no extrapolation beyond the final measurement and no interpolation of missing calories.

Every day in that interval must have usable calories AND activity. Gaps never become zero intake or zero exercise. We do not average only selected weekdays while fitting weight changes across omitted weekends. High-calorie, cheat and refeed days have no upper intake cutoff and are never clipped or discarded as calorie outliers.

### Automatic completeness proxies and limits

The legacy app has no complete-day flags. Neither a food list nor Health Connect can prove that every meal/workout was recorded. To avoid adding required user settings or confirmation flows:

- Explicit fasting with no food is a usable zero-intake day.
- Other days require valid nonnegative numeric item calories and intake at least `max(800, 0.65 × BMR)`; missing/empty or possibly partial low-intake days fail. Three or more food entries score 0.95 for intake quality; other eligible food days score 0.80; fasting scores 1. These are conservative heuristics, not proof. A legitimate very-low-calorie day may prevent calibration, and an incomplete high-intake day can evade detection.
- An activity day needs a valid recorded step count and a known gym/rest state. Merely absent step or gym history is not treated as completed zero activity.
- From this update onward the app automatically observes the current profile and currently logged gym/rest state on days the app is used. Saving Body stats also records the selected date's activity state. An explicit workout/rest record scores 1; a default observed no-workout state scores 0.85. Unlogged workouts remain unknowable.
- Manual daily step counts are treated as user-recorded daily totals. Phone steps require a successful local Health Connect read after the day ends. The app automatically requests completed-day totals for previously observed phone-step dates within the window, at most once per local day/session, with no permission prompt. Explicit Connect/Refresh retries this check. Failed, missing or unavailable readings do not become final zeros.
- Older days without dated profile/activity observations do not qualify simply because today's profile exists. Consequently calibration may need at least 28 new usable days after upgrade; existing weight/food history alone is not enough to assert reliable past activity.

## Robust trend and confidence

Fit a Theil–Sen robust linear regression against actual measurement dates. Median pair slopes use pairs at least seven days apart, reducing adjacent-day water-weight influence. Median intercept and residual MAD/RMS provide trend noise and uncertainty. Irregular intervals and multiple-day gaps retain their true durations. Isolated weight spikes have much less slope influence, but still reduce confidence.

`observedTDEE = averageIntake − dailyKgTrend × 7700`.

Negative weight trend increases inferred burn; positive trend reduces it. The 7700 factor is a long-term energy-balance approximation, not an assertion that every kg is fat. Do not calibrate when absolute trend exceeds 0.15 kg/day, slope uncertainty exceeds 0.06 kg/day, residual noise exceeds 1.5 kg, or inferred expenditure is outside 800–6000 kcal/day.

Confidence incorporates duration, full interval coverage, food quality, activity quality, weigh-in number/distribution, residual variability, measurement freshness and stability of previous observed expenditure estimates. Low confidence uses the uncalibrated estimate. Moderate requires score ≥0.55. High additionally requires score ≥0.85, at least 35 intake days, at least 10 weights and no weigh-in gap over 10 days. Confidence is a logging/model quality assessment, not clinical validation.

## Calibration and safeguards

`target = observedTDEE − averageHistoricalUncalibratedTDEE`, over the exact same aligned interval. This learns an additive systematic difference; steps, workouts and body weight still change daily expenditure.

For fully trusted data: `offsetNew = 0.90 × offsetOld + 0.10 × target`. Effective learning rate is `0.10 × quality`, so uncertain eligible data changes it more slowly. Both target and persisted offset are bounded to ±500 kcal/day; bounding the target prevents a single extreme value from jumping immediately to the offset limit. Three consecutive eligible daily targets beyond that limit produce a Low-confidence warning, halve the learning rate and suspend applying the learned offset until the warning clears. No calibration is applied when the observation is unreliable, though the stored offset is retained for possible recovery.

Calibration stores its last completed-day date and updates no more than once for that date. Reopening, refreshing or editing history cannot smooth it repeatedly in the same day. There is no catch-up loop applying many missed updates on launch. Daily effective offsets have their own dated timeline. A local-storage failure disables applying calibration and displays a Low-confidence explanation rather than silently claiming a persistent calibrated result.

## Historical values and statistics

The old application did not persist TDEE values; it recalculated all dates with the latest profile. At first valid-profile upgrade, the adapter preserves the values that the old formula would have displayed for existing historical dates, clearly marked **Legacy estimate reconstructed at upgrade**. This reconstruction is not a claim that those were previously saved or measured values. It uses the former height-based walking formula and former gym MET values.

New completed days with finalized activity receive immutable saved estimates. Later edits do not silently rewrite these or the legacy reconstruction. The Body stats panel shows preserved and recalculated values separately. Dates without saved history are explicitly marked recalculated. A recalculation uses that date's known profile and effective calibration timeline; today's learned offset is not applied retrospectively to every old day.

Daily, week/month and year views share the same dated result function. Today/future values are labelled projected full-day expenditure. Week/month totals compare intake and burn over matching logged/explicit-fasting dates, including today when logged. The summary says ‘includes today so far’ and identifies today's expenditure as a full-day projection. Future dates remain excluded. This live reporting does not change calibration: unfinished today is still excluded from the adaptive observation window. Year view still includes only completed months. Unlogged days remain excluded from reporting totals rather than being labelled fasts. Existing user calorie goals and the separate goal-remaining display are preserved; TDEE balance uses personalized expenditure.

## Validation

`npm test` covers formulas, zero/high steps, gym METs, loss/gain/stability, irregular weigh-ins, high-calorie weekends, water fluctuations, missing food/activity, duration requirements, current-day exclusion, daily smoothing, limits/warnings, data quality, repeat launches, legacy preservation, unchanged snapshots after edits, backups and storage failure. Existing step, food, AI, fasting and yearly tests remain enabled.

Browser checks at 320px and 390px verify the detailed panel without horizontal overflow, weight-dependent preview/cancel behavior, live month totals including today, backup content, a High-confidence seeded calibration and unchanged offset after reload. Responses from Health Connect still depend on when the source app makes its data locally available. No external TDEE service, new dependency or paid AI request is used.

## Months removed from yearly view

`dic:hiddenYearMonths` also excludes those months from adaptive calibration: their calorie/activity days are unavailable and their weigh-ins cannot define or support the regression interval. Excluded periods cannot be bridged by simply dropping their calorie records from an average. Ordinary daily food/weight records and saved historical estimates are retained.

Changing the excluded-month selection clears the learned calibration offset and its target/estimate stability history, preventing indirect influence from previously included months. The last daily update date is preserved so removing/restoring months cannot trigger repeated same-day learning. If enough eligible non-excluded history remains, subsequent daily calibration can learn from it. Restoring months makes their data eligible again under the normal quality requirements. Backup restoration checks the calibration's month selection against the current exclusions before applying it.
