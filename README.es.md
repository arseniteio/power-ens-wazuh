# Power ENS

[English version](README.md)

Power ENS es el plugin para el dashboard de Wazuh de OSCompliance ENS, para el Esquema Nacional de Seguridad (ENS, Real Decreto 311/2022). Guarda los parámetros de política de cada control y muestra el cumplimiento por control y por máquina.

No juzga nada. Cada resultado es un veredicto del motor de OSCompliance, leído del índice `oscompliance-verdicts`, así que el plugin necesita [oscompliance-ens-wazuh](https://github.com/arseniteio/oscompliance-ens-wazuh) para mostrar resultados.

Funciona en Wazuh 4.14.7, 4.14.8 y 4.14.9. Las pantallas están en español.

## Instalar

El script de instalación de OSCompliance ENS instala el plugin en cada nodo de dashboard, y el motor en el manager maestro: consulta los [primeros pasos](https://github.com/arseniteio/oscompliance-ens-wazuh/blob/main/README.es.md#primeros-pasos).

Para instalar solo el plugin, descarga en cada nodo de dashboard el zip de tu dashboard, `osd-2.19.5` para Wazuh 4.14.7 y `osd-2.19.6` para 4.14.8 y 4.14.9, compruébalo e instálalo.

```bash
v=2.1.0
url=https://github.com/arseniteio/power-ens-wazuh/releases/download/v$v
curl -fLO "$url/power-ens-$v-osd-2.19.6.zip" -O "$url/deploy-plugin.sh" -O "$url/SHA256SUMS"
sha256sum -c --ignore-missing SHA256SUMS
sudo bash deploy-plugin.sh "power-ens-wazuh-$v-osd-2.19.6.zip"
```

## Documentación

- [Instalación](docs/es/install.md): obtener el zip, instalarlo, dar acceso, actualizarlo y retirarlo.
- [Uso](docs/es/usage.md): qué muestra cada pantalla y cómo se configura un control.

## Compilar y probar

Compila el zip para la versión de OpenSearch Dashboards de tu Wazuh: 2.19.5 para 4.14.7, 2.19.6 para 4.14.8 y 4.14.9.

```bash
ci/build-zip.sh 2.19.6
```

Ejecuta las pruebas.

```bash
ci/run-tests.sh
```

## Licencia

Copyright (c) 2026 Quer System Informática.

Power ENS se distribuye bajo la GNU Affero General Public License versión 3 (AGPL-3.0-only). Consulta [LICENSE](LICENSE).

Quer System Informática ofrece también Power ENS con una licencia comercial, para organizaciones que no pueden cumplir las obligaciones de la AGPL, como mantener privados los cambios en un producto o en un servicio en red. Escribe a devqs@quersystem.com para conocer las condiciones.
