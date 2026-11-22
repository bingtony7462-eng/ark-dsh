#!/usr/bin/env bash
# 模擬 adb：FAKE_ADB_DEVICES 控制裝置清單，FAKE_ADB_PNG 指向要回傳的截圖
if [ "$1" = "devices" ]; then
  echo "List of devices attached"
  [ -n "$FAKE_ADB_DEVICES" ] && printf '%b\n' "$FAKE_ADB_DEVICES"
  exit 0
fi
[ "$1" = "-s" ] && shift 2
if [ "$1 $2 $3" = "exec-out screencap -p" ]; then cat "$FAKE_ADB_PNG"; exit 0; fi
echo "fake-adb: unsupported $*" >&2; exit 1
