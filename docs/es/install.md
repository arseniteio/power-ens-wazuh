# Instalación

Esta página cubre solo el plugin. La instalación completa, con las reglas, el motor y el agente, está en la [guía de oscompliance-ens-wazuh](https://github.com/arseniteio/oscompliance-ens-wazuh/blob/main/docs/es/install.md).

## Requisitos

- Wazuh 4.14.7, 4.14.8 o 4.14.9.
- 40 MB de disco en cada nodo de dashboard para el plugin, más la copia de la versión anterior que `deploy-plugin.sh` guarda en `/var/backups/power-ens`. No añade servicios ni trabajo en segundo plano al dashboard; las pantallas de resultados leen del indexer cuando se abren.
- Docker en la máquina donde se compila el zip, solo para compilarlo desde el código.
- `unzip` en el servidor del dashboard, en una instalación por paquetes, y `curl` y `python3` en el host del indexer para dar acceso.

## Obtener el zip

Consulta la versión de OpenSearch Dashboards de tu dashboard. Es 2.19.5 en Wazuh 4.14.7 y 2.19.6 en 4.14.8 y 4.14.9. Un zip solo funciona en la versión para la que se compiló.

```bash
grep -m1 '"version"' /usr/share/wazuh-dashboard/package.json
```

Descarga de la versión publicada el zip para esa versión, los scripts y las sumas de comprobación, y compruébalos. Cada línea debe terminar en `OK`.

```bash
v=2.1.0
url=https://github.com/arseniteio/power-ens-wazuh/releases/download/v$v
curl -fLO "$url/power-ens-$v-osd-2.19.6.zip" -O "$url/SHA256SUMS"
curl -fLO "$url/deploy-plugin.sh" -O "$url/create-admin-role.sh" -O "$url/dashboard.Dockerfile"
sha256sum -c --ignore-missing SHA256SUMS
```

Para compilarlo, ejecuta esto en el repositorio, con Docker. La primera compilación de cada versión crea una imagen de compilación y tarda unos 20 minutos. El resultado es `dist/powerEns-2.19.6.zip`, y los scripts están en `config/` y `ci/`.

```bash
ci/build-zip.sh 2.19.6
```

## Instalar por paquetes

Copia el zip y `deploy-plugin.sh` al servidor del dashboard y ejecuta esto como root. El script valida el zip, guarda una copia de la versión anterior en `/var/backups/power-ens`, instala el plugin y reinicia el dashboard. Si un paso falla, se detiene e indica cómo volver atrás.

```bash
bash deploy-plugin.sh "power-ens-wazuh-$v-osd-2.19.6.zip"
```

## Instalar en Docker

El plugin va en una imagen propia, porque lo que se instala en un contenedor en marcha se pierde al recrearlo. Copia el zip y `dashboard.Dockerfile` al host de Docker e indica tu versión de Wazuh.

```bash
docker build -f dashboard.Dockerfile --build-arg WAZUH_VERSION=4.14.8 \
  --build-arg PLUGIN_ZIP="power-ens-wazuh-$v-osd-2.19.6.zip" -t power-ens/wazuh-dashboard:local .
```

La imagen se indica en `docker-compose.override.yml`, junto a tu `docker-compose.yml`, sin tocar este. La instalación completa copia ese fichero desde el paquete de oscompliance-ens-wazuh. Con el fichero en su sitio, recrea el servicio desde la carpeta del compose.

```bash
docker compose up -d wazuh.dashboard
```

## Dar acceso

Quien tenga acceso al dashboard puede ver Power ENS. Para cambiar la configuración hace falta el rol `power_ens_admin` o `all_access`. En el host del indexer, este script crea el rol y se lo asigna a un usuario.

```bash
bash create-admin-role.sh --map <usuario_del_dashboard>
```

Lee los certificados de administrador del indexer de `/etc/wazuh-indexer/certs`. Usa `OS_CERT`, `OS_KEY`, `OS_CA` y `OS_URL` para otras ubicaciones, `OS_RESOLVE` cuando el certificado del indexer lleva otro nombre (en Docker, `wazuh.indexer:9200:127.0.0.1`), y `--dry-run` para ver lo que haría. Añade el usuario y mantiene a los que ya tienen el rol.

Las pestañas Máquinas, Estado y Pendiente leen `oscompliance-host-profile` y `oscompliance-verdicts` con los permisos del usuario que las abre, como las pantallas de resultados. Un rol que lee los índices de Wazuh pero no `oscompliance-*` necesita `read` sobre esos dos índices. El servidor del dashboard escribe los perfiles en `wazuh-ens-configuration`, igual que el resto de la configuración.

## Actualizar

Obtén el zip de la versión nueva e instálalo de la misma forma. El script sustituye la versión anterior y guarda su copia. En Docker, guarda la imagen actual con `docker tag power-ens/wazuh-dashboard:local power-ens/wazuh-dashboard:previous`, construye la nueva con la etiqueta `local` y recrea el servicio. Si después el navegador muestra una página en blanco, cierra la pestaña y vuelve a entrar.

## Retirar

Por paquetes:

```bash
sudo -u wazuh-dashboard /usr/share/wazuh-dashboard/bin/opensearch-dashboards-plugin remove powerEns
systemctl restart wazuh-dashboard
```

En Docker, quita el servicio `wazuh.dashboard` de `docker-compose.override.yml` y ejecuta `docker compose up -d wazuh.dashboard`.

La configuración se queda en el índice `wazuh-ens-configuration`, y una instalación posterior la encuentra.
