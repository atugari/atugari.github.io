#!/usr/bin/env bash
set -u
test_status=0
gradle --no-daemon :app:connectedDebugAndroidTest || test_status=$?
mkdir -p ../../wado-android-artifact/qa
adb pull /sdcard/Download/wado-qa/. ../../wado-android-artifact/qa/ || true
adb pull /sdcard/Download/wado-native-a4.pdf ../../wado-android-artifact/qa/android-12-questions.pdf || true
if [ ! -s ../../wado-android-artifact/qa/android-12-questions.pdf ]; then
  adb pull /sdcard/Documents/wado-native-a4.pdf ../../wado-android-artifact/qa/android-12-questions.pdf || true
fi
exit "$test_status"

