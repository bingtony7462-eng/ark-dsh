#!/usr/bin/env bash
# 模擬 maa-cli v0.7.5（測試用；輸出取自 maa-dsh-skill references/cli/commands.md）
D="$(cd "$(dirname "$0")" && pwd)"
case "$1" in
  --version|-V) echo "maa-cli v0.7.5" ;;
  version) printf 'maa-cli v0.7.5\nMaaCore v6.16.8\n' ;;
  --help|-h) cat "$D/maa-help-v0.7.5.txt" ;;
  dir) echo "/tmp/fake-maa-config" ;;
  *) echo "fake-maa: refusing to run '$*' in tests" >&2; exit 97 ;;
esac
