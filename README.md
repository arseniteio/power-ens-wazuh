# Power ENS

[Versión en español](README.es.md)

Power ENS is the Wazuh dashboard plugin of OSCompliance ENS, for the Spanish National Security Framework (ENS, Real Decreto 311/2022). It holds the policy parameters of each control and shows compliance per control and machine.

It judges nothing. Every result is a verdict of the OSCompliance engine, read from the `oscompliance-verdicts` index, so the plugin needs [oscompliance-ens-wazuh](https://github.com/arseniteio/oscompliance-ens-wazuh) to show results.

It runs on Wazuh 4.14.7, 4.14.8 and 4.14.9. The screens are in Spanish.

## Install

The OSCompliance ENS install script installs the plugin on each dashboard node, and the engine on the master manager: see [Get started](https://github.com/arseniteio/oscompliance-ens-wazuh#get-started).

To install only the plugin, download the zip of your dashboard on each dashboard node, `osd-2.19.5` for Wazuh 4.14.7 and `osd-2.19.6` for 4.14.8 and 4.14.9, check it and install it.

```bash
v=2.1.0
url=https://github.com/arseniteio/power-ens-wazuh/releases/download/v$v
curl -fLO "$url/power-ens-$v-osd-2.19.6.zip" -O "$url/deploy-plugin.sh" -O "$url/SHA256SUMS"
sha256sum -c --ignore-missing SHA256SUMS
sudo bash deploy-plugin.sh "power-ens-wazuh-$v-osd-2.19.6.zip"
```

## Documentation

- [Installation](docs/en/install.md): get the zip, install it, grant access, upgrade and remove it.
- [Usage](docs/en/usage.md): what each screen shows and how to configure a control.

## Build and test

Build the zip for the OpenSearch Dashboards version of your Wazuh: 2.19.5 for 4.14.7, 2.19.6 for 4.14.8 and 4.14.9.

```bash
ci/build-zip.sh 2.19.6
```

Run the tests.

```bash
ci/run-tests.sh
```

## License

Copyright (c) 2026 Quer System Informática.

Power ENS is licensed under the GNU Affero General Public License version 3 (AGPL-3.0-only). See [LICENSE](LICENSE).

Quer System Informática also offers Power ENS under a commercial license, for organisations that cannot meet the obligations of the AGPL, such as keeping changes private in a product or a network service. Contact devqs@quersystem.com for terms.
