#!/usr/bin/env bash
# 抓取真實 X 推文頁作為測試 fixture。
# 必須不帶 cookie —— 這正是擴充功能實際發出的請求。
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p test/fixtures

UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

capture () {
  local name="$1" url="$2"
  echo "抓取 ${name} ← ${url}"
  /usr/bin/curl -sS --compressed -A "$UA" "$url" -o "test/fixtures/${name}.html"
  echo "  $(/usr/bin/wc -c < "test/fixtures/${name}.html") bytes"
}

capture plain  'https://x.com/thsottiaux/status/2083053369351090254'
capture quoted 'https://x.com/thsottiaux/status/2082883636177916306'
capture media  'https://x.com/Guanksy/status/2083061426923475451'
capture quoted-with-media 'https://x.com/thsottiaux/status/2082981910209540352'
