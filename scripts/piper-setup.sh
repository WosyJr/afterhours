#!/usr/bin/env bash
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VEN="$ROOT/vendor"
VOX="$VEN/voices"
REL="https://github.com/rhasspy/piper/releases/download"
PIPER_URL="$REL/2023.11.14-2/piper_linux_x86_64.tar.gz"
VOICES="${PIPER_VOICES:-en-us-amy-low}"

say() { echo "[piper-setup] $*"; }

fetch() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 3 --retry-delay 2 --max-time 300 -o "$2" "$1"
    return $?
  fi
  if command -v wget >/dev/null 2>&1; then
    wget -q -t 3 -T 300 -O "$2" "$1"
    return $?
  fi
  say "neither curl nor wget is here"
  return 1
}

if [ "${PIPER_SKIP:-}" = "1" ]; then
  say "skipped, PIPER_SKIP is set"
  exit 0
fi

mkdir -p "$VEN" "$VOX"

if [ -x "$VEN/piper/piper" ]; then
  say "engine already present"
else
  say "fetching engine"
  T="$(mktemp -d)"
  if fetch "$PIPER_URL" "$T/piper.tar.gz"; then
    if tar -xzf "$T/piper.tar.gz" -C "$VEN"; then
      chmod +x "$VEN/piper/piper" 2>/dev/null
      say "engine ready"
    else
      say "engine archive would not unpack"
    fi
  else
    say "engine download failed, speech falls back to espeak"
  fi
  rm -rf "$T"
fi

for v in $VOICES; do
  if [ -f "$VOX/$v.onnx" ] && [ -f "$VOX/$v.onnx.json" ]; then
    say "voice $v already present"
    continue
  fi
  say "fetching voice $v"
  T="$(mktemp -d)"
  if fetch "$REL/v0.0.2/voice-$v.tar.gz" "$T/v.tar.gz"; then
    if tar -xzf "$T/v.tar.gz" -C "$T"; then
      find "$T" \( -name '*.onnx' -o -name '*.onnx.json' \) -exec cp -f {} "$VOX/" \;
      if [ -f "$VOX/$v.onnx" ]; then
        say "voice $v ready"
      else
        say "voice $v unpacked but the model was not where expected"
      fi
    else
      say "voice $v archive would not unpack"
    fi
  else
    say "voice $v download failed"
  fi
  rm -rf "$T"
done

exit 0
