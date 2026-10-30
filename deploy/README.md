# Production deployment

Production is `201.18.204.229`, serving `one10events.in` and `www.one10events.in`.
The website source of truth is this repository's **main** branch. Push or merge
changes to main; the VPS checks it every 60 seconds after the previous check ends.
A changed commit is built and tested before switching production. Build time is
additional to the polling interval. Other branches do not deploy.

The VPS uses a repository-scoped **read-only** deploy key. No GitHub write token
or inbound deployment endpoint is installed on the VPS. HTTPS host verification
is enabled for GitHub. Root SSH remains restricted to the configured key holders.

## What is deployed

- React is rebuilt with `npm ci`, the committed package lock and Node 22.
- The backend image uses Python 3.12 and `backend/requirements.txt`, constrained
  by `deploy/requirements.lock`. Update the lock alongside dependency changes.
- MongoDB 8.2.11 and its persistent volume are retained across deployments.
- `.env`, private uploads, public uploads, databases, certificates and SSH keys
  stay on the VPS and must never be committed to Git.
- Existing private uploads remain under `backend/private_uploads`; public
  uploads and generated reports/QR assets are under `/var/www/one10events`.

Build failures leave the live version unchanged. Switching takes a brief backend
restart. A failed health check rolls code, frontend and backend image back to the
previous deployment. A failed SHA is not rebuilt every minute; push a fix or retry
it manually. Local tracked edits cause deployment to stop instead of discarding
them. Non-fast-forward history changes are rejected.

The script captures a local MongoDB logical backup with the backend stopped
before switching. It does not automatically roll back database migrations or
external payment side effects. Schema changes must be backward compatible;
review migrations and restore procedures separately. Local backups are not an
offsite backup service. Old releases/images and local database backups are kept
for recovery; monitor disk space and prune only after review.

## Operations

```sh
systemctl list-timers one10events-deploy.timer
journalctl -u one10events-deploy.service -n 100 --no-pager
cat /opt/one10events/deployed-sha
cat /opt/one10events/deployed-at
systemctl start one10events-deploy.service
# Explicitly retry or rebuild the same revision:
/usr/local/sbin/one10events-deploy --force
# Pause automatic deployment while investigating:
systemctl stop one10events-deploy.timer
```

To undo an application change, revert it in GitHub and push the resulting commit
to main. This preserves the fast-forward history required by deployment.

## Initial setup on a restored VPS

Restore the Git checkout at `/root/one10events-app`, production `.env`, MongoDB,
public uploads and Nginx/TLS first. Restore/create a repository-scoped read-only
deploy key at `/root/.ssh/one10events_github_read` and verify GitHub's SSH host key
in `/root/.ssh/one10events_github_known_hosts`. Configure origin as
`git@github.com:rittikroy1990/One-10-Durga-Pujo-2026.git`.

Create `/opt/one10events/releases` with traversable permissions for Nginx. Move
the existing `/var/www/one10events/build` into an initial release directory and
replace that web-root path with a symlink to the preserved build. Retain the
existing backend container until the first deployment switches it.

```sh
install -m 755 deploy/deploy.sh /usr/local/sbin/one10events-deploy
install -m 644 deploy/one10events-deploy.{service,timer} /etc/systemd/system/
systemctl daemon-reload
systemctl start one10events-deploy.service
# Only enable polling after the first deployment is verified:
systemctl enable --now one10events-deploy.timer
```

Changes to the deployment script install themselves after a successful deploy.
Systemd unit/timer changes require explicit installation and daemon-reload.
