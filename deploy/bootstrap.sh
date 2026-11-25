#!/usr/bin/env bash
# One-step installer for a fresh Ubuntu 24.04 droplet, for the DigitalOcean web console.
#
# It downloads the website code from a URL (a GitHub repository archive) and then runs deploy/provision.sh.
#
# In the droplet's web console (logged in as root), run:
#
#   curl -fsSL https://raw.githubusercontent.com/OWNER/REPO/main/deploy/bootstrap.sh -o bootstrap.sh && DOMAIN=stmarymilford.org ADMIN_EMAIL=you@example.org CODE_URL=https://github.com/OWNER/REPO/archive/refs/heads/main.tar.gz bash bootstrap.sh
#
# For a private repository, also set GITHUB_TOKEN to a GitHub token that can read the repository.
# Set DRY_RUN=1 to only download and unpack the code, without installing anything.
set -euo pipefail

: "${DOMAIN:?Set DOMAIN, e.g. DOMAIN=stmarymilford.org}"
: "${ADMIN_EMAIL:?Set ADMIN_EMAIL, e.g. ADMIN_EMAIL=you@example.org}"
: "${CODE_URL:?Set CODE_URL to the repository archive, e.g. https://github.com/OWNER/REPO/archive/refs/heads/main.tar.gz}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root (the DigitalOcean web console logs you in as root by default)." >&2
  exit 1
fi

case "$CODE_URL" in
  *OWNER*|*REPO*)
    echo "CODE_URL still contains OWNER or REPO. Replace them with your GitHub username and repository name." >&2
    exit 1 ;;
esac

WORK="$(mktemp -d /root/stmary-install.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT

echo "==> Downloading the website code"
CURL_ARGS=(-fsSL)
if [ -n "${GITHUB_TOKEN:-}" ]; then
  CURL_ARGS+=(-H "Authorization: token ${GITHUB_TOKEN}")
fi
if ! curl "${CURL_ARGS[@]}" "$CODE_URL" -o "$WORK/code.tar.gz"; then
  echo "Could not download $CODE_URL. Check the repository exists, is spelled correctly, and (if private) that GITHUB_TOKEN is set." >&2
  exit 1
fi

echo "==> Unpacking"
mkdir "$WORK/src"
tar -xzf "$WORK/code.tar.gz" -C "$WORK/src"
ROOT_DIR="$(find "$WORK/src" -maxdepth 2 -name package.json -printf '%h\n' | head -1)"
if [ -z "$ROOT_DIR" ] || [ ! -f "$ROOT_DIR/deploy/provision.sh" ]; then
  echo "Could not find the website code in that archive (expected package.json and deploy/provision.sh)." >&2
  exit 1
fi
echo "    Found the code in $(basename "$ROOT_DIR")"

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "==> DRY_RUN: download and unpacking worked. Nothing was installed."
  exit 0
fi

echo "==> Running the installer"
export DOMAIN ADMIN_EMAIL
bash "$ROOT_DIR/deploy/provision.sh"
