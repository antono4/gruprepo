#!/usr/bin/env bash
# Perbarui data repository setiap ~2 menit.
# Dipanggil oleh GitHub Actions (lihat .github/workflows/update.yml).
# Cron Actions minimal 5 menit, jadi satu run melakukan beberapa iterasi
# dengan jeda 120 detik sampai digantikan run berikutnya.
set -u

cd "$(dirname "$0")/.."

TARGET="${PUSH_TARGET:-HEAD:main}"
ITER="${UPDATE_ITERATIONS:-24}"
INTERVAL="${UPDATE_INTERVAL:-120}"
TOKEN="${GITHUB_TOKEN:-}"

git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"

for i in $(seq 1 "$ITER"); do
  echo "== Iterasi $i/$ITER pada $(date -u +%H:%M:%SZ) =="
  node scripts/update-repos.js || echo "update-repos.js gagal, lanjut iterasi berikutnya"

  git add index.html README.md
  if git diff --cached --quiet; then
    echo "Tidak ada perubahan data."
  elif [ -n "$TOKEN" ]; then
    git commit -m "chore: perbarui data repository" || echo "komit kosong"
    if git push "https://x-access-token:${TOKEN}@github.com/antono4/gruprepo.git" "$TARGET"; then
      echo "Push berhasil."
    else
      echo "Push gagal, dicoba lagi pada iterasi berikutnya."
    fi
  else
    echo "GITHUB_TOKEN kosong — komit dibuat lokal tanpa push."
    git commit -m "chore: perbarui data repository" || echo "komit kosong"
  fi

  if [ "$i" -lt "$ITER" ]; then
    echo "Menunggu ${INTERVAL}s..."
    sleep "$INTERVAL"
  fi
done

echo "Selesai — loop perbaruan selesai."