# Installation

This page covers the plugin only. The full installation, with the rules, the engine and the agent, is in the [oscompliance-ens-wazuh guide](https://github.com/arseniteio/oscompliance-ens-wazuh/blob/main/docs/en/install.md).

## Requirements

- Wazuh 4.14.7, 4.14.8 or 4.14.9.
- 40 MB of disk on each dashboard node for the plugin, plus a copy of the previous version that `deploy-plugin.sh` keeps in `/var/backups/power-ens`. It adds no service and no background work to the dashboard; the result screens read from the indexer when they are opened.
- Docker on the machine that builds the zip, only to build it from source.
- `unzip` on the dashboard server, for an installation from packages, and `curl` and `python3` on the indexer host to grant access.

## Get the zip

Find the OpenSearch Dashboards version of your dashboard. It is 2.19.5 on Wazuh 4.14.7 and 2.19.6 on 4.14.8 and 4.14.9. A zip works only on the version it was built for.

```bash
grep -m1 '"version"' /usr/share/wazuh-dashboard/package.json
```

Download the zip for that version, the scripts and the checksums from the release, and check them. Every line must end in `OK`.

```bash
v=2.1.0
url=https://github.com/arseniteio/power-ens-wazuh/releases/download/v$v
curl -fLO "$url/power-ens-$v-osd-2.19.6.zip" -O "$url/SHA256SUMS"
curl -fLO "$url/deploy-plugin.sh" -O "$url/create-admin-role.sh" -O "$url/dashboard.Dockerfile"
sha256sum -c --ignore-missing SHA256SUMS
```

To build it instead, run this in the repository, with Docker. The first build for a version creates a builder image and takes about 20 minutes. The result is `dist/powerEns-2.19.6.zip`, and the scripts are in `config/` and `ci/`.

```bash
ci/build-zip.sh 2.19.6
```

## Install from packages

Copy the zip and `deploy-plugin.sh` to the dashboard server, and run this as root. The script validates the zip, keeps a copy of any previous version in `/var/backups/power-ens`, installs the plugin and restarts the dashboard. If a step fails, it stops and prints how to go back.

```bash
bash deploy-plugin.sh "power-ens-wazuh-$v-osd-2.19.6.zip"
```

## Install on Docker

The plugin goes into its own image, because anything installed in a running container is lost when the container is recreated. Copy the zip and `dashboard.Dockerfile` to the Docker host, and set your Wazuh version.

```bash
docker build -f dashboard.Dockerfile --build-arg WAZUH_VERSION=4.14.8 \
  --build-arg PLUGIN_ZIP="power-ens-wazuh-$v-osd-2.19.6.zip" -t power-ens/wazuh-dashboard:local .
```

The image is set in `docker-compose.override.yml`, next to your `docker-compose.yml`, which stays untouched. The full installation copies that file from the oscompliance-ens-wazuh package. With the file in place, recreate the service from the compose folder.

```bash
docker compose up -d wazuh.dashboard
```

## Grant access

Everyone with access to the dashboard can see Power ENS. Changing the configuration needs the `power_ens_admin` or the `all_access` role. On the indexer host, this script creates the role and assigns it to a user.

```bash
bash create-admin-role.sh --map <dashboard_user>
```

It reads the indexer's admin certificates from `/etc/wazuh-indexer/certs`. Use `OS_CERT`, `OS_KEY`, `OS_CA` and `OS_URL` for other locations, `OS_RESOLVE` when the indexer certificate carries another name (on Docker, `wazuh.indexer:9200:127.0.0.1`), and `--dry-run` to see what it would do. It adds the user and keeps the ones that already have the role.

The Máquinas, Estado and Pendiente tabs read `oscompliance-host-profile` and `oscompliance-verdicts` with the permissions of the user who opens them, like the result screens. A role that reads the Wazuh indices but not `oscompliance-*` needs `read` on those two indices. The dashboard server writes the profiles to `wazuh-ens-configuration`, as it writes the rest of the configuration.

## Upgrade

Get the zip of the new release and install it the same way. The script replaces the previous version and keeps its copy. On Docker, keep the current image with `docker tag power-ens/wazuh-dashboard:local power-ens/wazuh-dashboard:previous`, build the new one with the `local` tag and recreate the service. If a browser shows a blank page afterwards, close the tab and log in again.

## Remove

From packages:

```bash
sudo -u wazuh-dashboard /usr/share/wazuh-dashboard/bin/opensearch-dashboards-plugin remove powerEns
systemctl restart wazuh-dashboard
```

On Docker, remove the `wazuh.dashboard` service from `docker-compose.override.yml` and run `docker compose up -d wazuh.dashboard`.

The configuration stays in the `wazuh-ens-configuration` index, so a later installation finds it.
