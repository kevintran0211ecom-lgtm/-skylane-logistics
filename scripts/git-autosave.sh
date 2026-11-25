#!/usr/bin/env bash
# Tự động lưu code lên GitHub: commit mọi thay đổi rồi push lên nhánh hiện tại.
#
# Cách dùng:
#   scripts/git-autosave.sh            # commit + push một lần
#   scripts/git-autosave.sh --commit   # chỉ commit (không push)
#   scripts/git-autosave.sh --watch    # theo dõi liên tục, tự lưu 20 giây sau lần sửa cuối
#
# Được gọi tự động bởi hook trong .claude/settings.json sau mỗi lần Claude sửa file.
set -uo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null || dirname "$0")/" || exit 0
[ -d .git ] || { echo "autosave: chưa phải git repo" >&2; exit 0; }

LOCK=".git/autosave.lock"
DEBOUNCE="${AUTOSAVE_DEBOUNCE:-20}"

save() {
  local push="$1"
  exec 9>"$LOCK"
  flock -n 9 || return 0 # một lần lưu khác đang chạy

  if [ -n "$(git status --porcelain)" ]; then
    git add -A
    # Không bao giờ đưa file bí mật lên GitHub
    git reset -q -- .env .env.local '*.pem' 2>/dev/null || true
    if ! git diff --cached --quiet; then
      local files
      files=$(git diff --cached --name-only | head -5 | xargs -n1 basename | paste -sd ", " -)
      local n
      n=$(git diff --cached --name-only | wc -l | tr -d ' ')
      git commit -q -m "autosave: ${files}$([ "$n" -gt 5 ] && echo " (+$((n - 5)) file)")" \
        -m "Tự động lưu lúc $(TZ=Asia/Saigon date '+%d/%m/%Y %H:%M:%S')" \
        && echo "autosave: đã commit $n file"
    fi
  fi

  if [ "$push" = 1 ] && git remote get-url origin >/dev/null 2>&1; then
    local branch
    branch=$(git rev-parse --abbrev-ref HEAD)
    if [ -n "$(git log "origin/$branch..HEAD" 2>/dev/null || echo new)" ]; then
      if git push -q -u origin "$branch" 2>/tmp/autosave-push.err; then
        echo "autosave: đã push lên origin/$branch"
      else
        echo "autosave: push thất bại (sẽ thử lại lần sau): $(tail -1 /tmp/autosave-push.err)" >&2
      fi
    fi
  fi
}

case "${1:-}" in
  --commit) save 0 ;;
  --watch)
    echo "autosave: đang theo dõi $(pwd) — Ctrl+C để dừng"
    last=""
    while sleep 5; do
      now=$(git status --porcelain | md5sum)
      if [ "$now" != "$last" ]; then last="$now"; changed=$(date +%s); fi
      if [ -n "${changed:-}" ] && [ $(($(date +%s) - changed)) -ge "$DEBOUNCE" ]; then
        save 1; changed=""; last=$(git status --porcelain | md5sum)
      fi
    done
    ;;
  *) save 1 ;;
esac
exit 0
