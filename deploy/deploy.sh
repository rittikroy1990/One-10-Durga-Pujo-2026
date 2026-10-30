#!/usr/bin/env bash
# Install at /usr/local/sbin/one10events-deploy on the production VPS.
set -Eeuo pipefail
umask 022
REPO=/root/one10events-app
STATE=/opt/one10events
RELEASES=$STATE/releases
WEB=/var/www/one10events/build
mkdir -p "$RELEASES"
exec 9>/run/lock/one10events-deploy.lock
flock -n 9 || exit 0
export GIT_SSH_COMMAND='ssh -i /root/.ssh/one10events_github_read -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/root/.ssh/one10events_github_known_hosts'
git -C "$REPO" fetch origin main:refs/remotes/origin/main
target=$(git -C "$REPO" rev-parse origin/main)
previous=$(git -C "$REPO" rev-parse HEAD)
force=${1:-}
if [[ "$force" != --force && -f "$STATE/deployed-sha" && $(cat "$STATE/deployed-sha") == "$target" ]]; then
    echo "Already deployed $target"
    exit 0
fi
if [[ "$force" != --force && -f "$STATE/failed-sha" && $(cat "$STATE/failed-sha") == "$target" ]]; then
    echo "Deployment previously failed for $target; fix main or retry with --force" >&2
    exit 1
fi
if ! git -C "$REPO" diff --quiet || ! git -C "$REPO" diff --cached --quiet; then
    echo "Refusing to overwrite local tracked changes; commit and push them first" >&2
    exit 1
fi
git -C "$REPO" merge-base --is-ancestor "$previous" "$target" || {
    echo "Refusing a non-fast-forward deployment" >&2; exit 1;
}
release=$RELEASES/$target
image=one10events-backend:$target
old_image=$(docker inspect one10events-backend --format '{{.Config.Image}}')
old_web=$(readlink -f "$WEB")
switching=0
health() {
    local i
    for i in {1..45}; do
        if curl --fail --silent --max-time 3 http://127.0.0.1:8010/api/health >/dev/null; then return 0; fi
        sleep 2
    done
    return 1
}
start_backend() {
    docker run -d --name one10events-backend --restart unless-stopped --network host \
        -e APP_URL=https://one10events.in \
        -v "$REPO:$REPO" \
        -v /var/www/one10events:/var/www/one10events \
        -v "$WEB:$REPO/frontend/build" \
        -w "$REPO/backend" "$1" >/dev/null
}
switch_web() {
    ln -s "$1" "$WEB.next"
    mv -Tf "$WEB.next" "$WEB"
}
failed() {
    local code=$?
    trap - ERR
    set +e
    printf '%s\n' "$target" > "$STATE/failed-sha"
    if [[ "$switching" == 1 ]]; then
        echo "Deployment failed; restoring previous code and frontend" >&2
        docker rm -f one10events-backend >/dev/null 2>&1
        git -C "$REPO" reset --hard "$previous"
        rm -f "$WEB.next"
        switch_web "$old_web"
        start_backend "$old_image"
        health || echo "ROLLBACK HEALTH CHECK FAILED: operator action required" >&2
    fi
    echo "Deployment $target failed; see journalctl -u one10events-deploy.service" >&2
    exit "$code"
}
trap failed ERR
if [[ ! -d "$release" ]]; then
    git -C "$REPO" worktree add --detach "$release" "$target"
fi
echo "Building $target before changing production"
docker build -f "$release/deploy/Dockerfile" -t "$image" "$release"
docker run --rm --memory=3g --cpus=2 \
    -e CI=false -e GENERATE_SOURCEMAP=false \
    -v "$release/frontend:/app" -w /app node:22-bookworm \
    sh -ec 'npm ci --no-audit --no-fund && npm run build'
test -s "$release/frontend/build/index.html"
printf '{"commit":"%s","built_at":"%s"}\n' "$target" "$(date -u +%FT%TZ)" \
    > "$release/frontend/build/deployment-version.json"
# Imports validate syntax/dependencies without running lifespan handlers against the database.
docker run --rm \
    -v "$release:$release" \
    -v "$REPO/backend/.env:$release/backend/.env:ro" \
    -w "$release/backend" "$image" python -c 'import server; print("Backend imports OK")'
# Reject edits made during the build as well as edits present before it.
git -C "$REPO" diff --quiet
git -C "$REPO" diff --cached --quiet
if [[ ! -L "$WEB" ]]; then
    echo "Web root must be a symlink; perform the documented initial setup first" >&2
    exit 1
fi
mkdir -p "$STATE/backups"
chmod 700 "$STATE/backups"
switching=1
docker stop one10events-backend >/dev/null
# Preserve a fresh logical database backup while application writes are paused.
docker exec one10events-mongo mongodump --quiet --db one10_events --archive --gzip \
    > "$STATE/backups/before-$target-$(date -u +%Y%m%dT%H%M%SZ).archive.gz"
chmod 600 "$STATE"/backups/*.archive.gz
git -C "$REPO" merge --ff-only "$target"
switch_web "$release/frontend/build"
docker rm one10events-backend >/dev/null
start_backend "$image"
health
curl --fail --silent --resolve one10events.in:443:127.0.0.1 https://one10events.in/ >/dev/null
curl --fail --silent --resolve one10events.in:443:127.0.0.1 https://one10events.in/api/config >/dev/null
curl --fail --silent --resolve one10events.in:443:127.0.0.1 https://one10events.in/deployment-version.json \
    | grep -Fq "$target"
printf '%s\n' "$target" > "$STATE/deployed-sha"
printf '%s\n' "$target" > "$STATE/SOURCE_COMMIT"
docker image inspect "$image" --format '{{.Id}}' > "$STATE/IMAGE_ID"
date -u +%FT%TZ > "$STATE/deployed-at"
rm -f "$STATE/failed-sha"
switching=0
# Future changes to this script take effect after the new version succeeds.
install -m 755 "$REPO/deploy/deploy.sh" /usr/local/sbin/one10events-deploy.next
mv /usr/local/sbin/one10events-deploy.next /usr/local/sbin/one10events-deploy
echo "Successfully deployed $target"
