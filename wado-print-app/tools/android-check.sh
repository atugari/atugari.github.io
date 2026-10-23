#!/usr/bin/env bash
set -u
test_status=0
gradle --no-daemon :app:connectedDebugAndroidTest || test_status=$?
mkdir -p ../../wado-android-artifact/qa
adb pull /sdcard/Download/wado-qa/. ../../wado-android-artifact/qa/ || true
exit "$test_status"

