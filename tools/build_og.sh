#!/bin/sh
# Pravi assets/og-en.png i assets/og-sr.png (1200 × 630) iz tools/og.html pomoću Chrome-a bez prozora.
cd "$(dirname "$0")/.."
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for L in en sr; do
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=1200,630 --virtual-time-budget=5000 \
    --screenshot="assets/og-$L.png" "file://$PWD/tools/og.html#$L"
done
