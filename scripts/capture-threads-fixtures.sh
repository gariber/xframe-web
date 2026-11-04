#!/usr/bin/env bash
# 抓取真實 Threads 貼文頁作為測試 fixture（gzip 存放，每份解壓約 600–700 KB）。
# Threads 只對爬蟲 UA 回伺服器算繪、內嵌貼文 JSON 的版本，一般瀏覽器 UA 拿到的是空殼。
# 貼文被刪除時要換一則；被拒的那份本來就是轉回首頁的頁面。
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p test/fixtures

UA='Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

capture () {
  local name="$1" url="$2"
  echo "抓取 ${name} ← ${url}"
  /usr/bin/curl -sS -L -A "$UA" -H 'Accept-Language: zh-TW,zh;q=0.9,en;q=0.8' "$url" | /usr/bin/gzip -9 > "test/fixtures/threads-${name}.html.gz"
  echo "  $(/usr/bin/wc -c < "test/fixtures/threads-${name}.html.gz") bytes (gzip)"
}

capture text    'https://www.threads.com/@mm791019/post/DfADzgzkyqC'
capture video   'https://www.threads.com/@balloonhoney_/post/De_0StIEr2x'
capture image   'https://www.threads.com/@peng_1219/post/DfBZOYkszrY'
capture comment 'https://www.threads.com/@mm791019/post/DfAFGQOk0Mt'
capture refused 'https://www.threads.com/@foodlove_0810/post/Db579SgE2br'
