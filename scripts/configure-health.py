import re, sys
from pathlib import Path

if not Path("node_modules/capacitor-health").is_dir():
    sys.exit("Install capacitor-health before configuring automatic steps")
from xml.dom import minidom

manifest_path = 'android/app/src/main/AndroidManifest.xml'
variables_path = 'android/variables.gradle'

# 1) Health Connect needs Android 8.0 (API 26) or newer
with open(variables_path) as f:
    variables = f.read()
m = re.search(r'minSdkVersion\s*=\s*(\d+)', variables)
if not m:
    sys.exit('ERROR: could not find minSdkVersion in android/variables.gradle')
if int(m.group(1)) < 26:
    variables = variables[:m.start(1)] + '26' + variables[m.end(1):]
    with open(variables_path, 'w') as f:
        f.write(variables)

with open(manifest_path) as f:
    manifest = f.read()

# 2) Permission to read steps (before <application>)
if 'android.permission.health.READ_STEPS' not in manifest:
    perm = '    <uses-permission android:name="android.permission.health.READ_STEPS" />\n'
    manifest, n = re.subn(r'([ \t]*)<application', lambda mm: perm + mm.group(0), manifest, count=1)
    if n != 1:
        sys.exit('ERROR: could not find <application> in AndroidManifest.xml')

# 3) Let the app see the Health Connect app (before <application>)
if 'com.google.android.apps.healthdata' not in manifest:
    queries = '    <queries>\n        <package android:name="com.google.android.apps.healthdata" />\n    </queries>\n'
    manifest, n = re.subn(r'([ \t]*)<application', lambda mm: queries + mm.group(0), manifest, count=1)
    if n != 1:
        sys.exit('ERROR: could not add <queries> to AndroidManifest.xml')

# 4) Permission-rationale screens Health Connect requires (inside <application>).
#    The activity must come before the alias that targets it.
if 'PermissionsRationaleActivity' not in manifest:
    block = (
        '        <activity android:name="com.fit_up.health.capacitor.PermissionsRationaleActivity" android:exported="true">\n'
        '            <intent-filter>\n'
        '                <action android:name="androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" />\n'
        '            </intent-filter>\n'
        '        </activity>\n'
        '        <activity-alias android:name="ViewPermissionUsageActivity" android:exported="true"'
        ' android:targetActivity="com.fit_up.health.capacitor.PermissionsRationaleActivity"'
        ' android:permission="android.permission.START_VIEW_PERMISSION_USAGE">\n'
        '            <intent-filter>\n'
        '                <action android:name="android.intent.action.VIEW_PERMISSION_USAGE" />\n'
        '                <category android:name="android.intent.category.HEALTH_PERMISSIONS" />\n'
        '            </intent-filter>\n'
        '        </activity-alias>\n'
    )
    manifest, n = re.subn(r'([ \t]*)</application>', lambda mm: block + mm.group(0), manifest, count=1)
    if n != 1:
        sys.exit('ERROR: could not find </application> in AndroidManifest.xml')

# The plugin declares other health data types; this app only reads steps.
if 'xmlns:tools=' not in manifest:
    manifest = manifest.replace('<manifest ', '<manifest xmlns:tools="http://schemas.android.com/tools" ', 1)
for permission in ('READ_EXERCISE', 'READ_DISTANCE', 'READ_ACTIVE_CALORIES_BURNED',
                   'READ_TOTAL_CALORIES_BURNED', 'READ_HEART_RATE', 'READ_EXERCISE_ROUTE'):
    name = 'android.permission.health.' + permission
    if name not in manifest:
        manifest = manifest.replace('<application', '<uses-permission android:name="' + name + '" tools:node="remove" />\n    <application', 1)

# The plugin's rationale activity loads this resource. Keep the policy bundled/offline.
privacy = Path('android/app/src/main/res/values/health_privacy.xml')
privacy.parent.mkdir(parents=True, exist_ok=True)
privacy.write_text('<resources><string name="privacy_policy_url" translatable="false">file:///android_asset/public/health-privacy.html</string></resources>\n')

minidom.parseString(manifest)  # fail the build early if the XML is malformed
with open(manifest_path, 'w') as f:
    f.write(manifest)
print('Android project configured for Health Connect steps')
