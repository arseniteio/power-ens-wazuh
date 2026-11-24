# Uso

Power ENS aparece en el menú del dashboard de Wazuh. Todos los resultados vienen del motor de OSCompliance, que se ejecuta cada 15 minutos: un cambio hecho aquí se ve tras su siguiente pasada.

## Configuración

Configuración guarda lo que declara la organización. La explicación de cada sección está en el icono de información junto a su título. Cualquiera con acceso al dashboard puede verla; para guardar hace falta el rol `power_ens_admin` o `all_access`. Tiene cuatro pestañas.

Grupos y máquinas es donde se fijan los valores por grupo de máquinas. La lista de la izquierda muestra los grupos, cuántas máquinas tiene cada uno y si tiene valores, y Sin grupo para las máquinas que no están en ninguno. Una máquina entra en un grupo porque cumple sus condiciones (distribución, familia, función, servicio, grupo de Wazuh, nombre) o porque se añadió a mano. Cada grupo tiene dos vistas:

- Controles lista los controles con parámetros por máquina. Configurar abre los valores que el grupo da a todas sus máquinas.
- Máquinas lista sus máquinas, con su sistema operativo, página a página y con búsqueda. Al elegir varias aparecen Añadir a grupo, Sacar del grupo (en un grupo elegido a mano), Plantilla y Fijar valor.

Cargar plantilla copia en el grupo los valores de una plantilla incluida (Ubuntu, Windows, manager); los que el grupo ya tenía para los mismos parámetros se sustituyen. Editar grupo abre el grupo en cuatro secciones, Identificación, Capa, Condiciones y Parámetros, con la lista de máquinas que incluye. Nuevo crea un grupo vacío, a partir de otro o desde un fichero; Exportar escribe los grupos en YAML.

Al abrir una máquina se ven sus grupos, su plantilla y sus controles. La plantilla da valores de partida según el tipo de sistema: Detectado automáticamente, una elegida a mano o Sin plantilla, en cuyo caso solo recibe los valores de sus grupos y los propios. Configurar en un control abre sus parámetros con el origen de cada valor (la máquina, un grupo, la plantilla o la organización); lo que se cambia ahí vale solo para esa máquina.

Los cambios en grupos se acumulan en la barra inferior de la página. Revisar los lista, Descartar los quita y Guardar los escribe todos. La plantilla y los valores por máquina se guardan al momento. El motor lo aplica todo en su siguiente pasada.

Pendiente lista lo que necesita una decisión: las máquinas sin grupo y los parámetros sin valor que dejan evidencias sin evaluar, según los últimos veredictos. Cada parámetro enlaza con donde se fija: un grupo para los parámetros por máquina y Organización para el resto.

Organización guarda, una sola vez, los datos que comparten varios controles: personal autorizado, entorno de preproducción, herramientas de cambios e incidentes, algoritmos autorizados por el CCN, plazos de retención, zonas controladas, canales de acceso remoto, productos certificados, formación del personal, actividades de concienciación, grupos con privilegio y declaración de aplicabilidad. Cada control lee las filas de su uso. Guarda también los valores de cada control que valen para toda la organización. Abre un control y pulsa Completar configuración para rellenar lo que falta. Desde un control también se puede asignar una plantilla a algunas máquinas.

Organización guarda también los Ajustes de nivel y las Escalas de madurez. Un ajuste juzga un control, en todas las máquinas o en una, a un nivel inferior al vigente, y necesita un motivo. Una escala fija el porcentaje mínimo de elementos conformes para L1 a L5 en las evidencias que cuentan elementos; sin escala, el motor usa la tabla facilitada por un auditor del CCN: 20, 40, 60, 80 y 100 %. Tabla del CCN la carga en una escala. L2 cumple en BÁSICO, L3 en MEDIO y L4 en ALTO.

General guarda el cliente, la categoría del sistema (BÁSICO, MEDIO o ALTO), los grupos en alcance (Grupos evaluables) y Grupos por control. Hasta que se pulsa Guardar configuración global por primera vez, el motor y el plugin usan la configuración por defecto del catálogo, `common/ens/catalog/default-configuration.json`: categoría MEDIO y el grupo `ens` en alcance. Guarda para cambiarlos.

El valor de una máquina sale del primero de: su valor propio, la plantilla asignada en el control, sus grupos, su plantilla y el valor de la organización. Las listas se suman entre grupos; el resto de valores salen de la capa más específica. El orden se describe en [política ENS](https://github.com/arseniteio/oscompliance-ens-wazuh/blob/main/docs/es/configuration.md#política-ens).

Para automatizar, `oscompliance-policy` lee y escribe los mismos grupos, guardados como perfiles, desde ficheros YAML en el manager, y `config/set-parameters.py` rellena valores de la organización y de máquinas desde un fichero JSON después del primer guardado. Consulta [perfiles](https://github.com/arseniteio/oscompliance-ens-wazuh/blob/main/docs/es/configuration.md#perfiles) y [parámetros desde un fichero](https://github.com/arseniteio/oscompliance-ens-wazuh/blob/main/docs/es/configuration.md#parámetros-desde-un-fichero).

Un parámetro que nadie ha definido nunca se sustituye por una suposición: las evidencias que lo necesitan salen como no evaluables y el motivo nombra la máquina, el parámetro y el valor vigente o su ausencia. El icono de información junto a cada parámetro muestra su descripción. El significado de cada parámetro está en las [páginas de control](https://github.com/arseniteio/oscompliance-ens-wazuh/tree/main/docs/es/controls).

Con Grupos por control activado, el motor crea un grupo de Wazuh por control, `ens-excluir-<control>`. Una máquina añadida a uno de esos grupos queda fuera de ese control. En Detalle del control, un usuario con `power_ens_admin` o `all_access` pulsa Excluir de este control para mover la máquina a ese grupo, y debe escribir un motivo. Power ENS registra la máquina, el control, el motivo, el usuario y la fecha en el índice `wazuh-ens-exclusions`. Volver a incluir lo revierte, también con motivo. El manager no pertenece a ningún grupo y no se puede excluir.

Una instalación puede tener varios sistemas ENS, cada uno con su categoría, su alcance, sus parámetros, sus datos de Organización y su madurez. General, Sistemas ENS crea uno a partir de un identificador (minúsculas, cifras y guiones) y un nombre; empieza con los datos y parámetros del Sistema principal y un alcance vacío, sin los valores propios de las máquinas ni las valoraciones de madurez. Un sistema distinto del Sistema principal tiene que indicar sus grupos de Wazuh, y dos sistemas no pueden compartir un grupo: cada máquina pertenece a un solo sistema, y el Sistema principal se queda con las máquinas que no reclama ningún otro. Con más de un sistema, Sistema ENS, arriba en todas las pestañas, elige el que se muestra; todas las vistas, informes y guardados se aplican a ese sistema. Eliminar borra el sistema seleccionado; sus máquinas vuelven al Sistema principal y se conservan su historial y sus veredictos. El manager se juzga en todos los sistemas. `config/set-parameters.py` y el resto de scripts de `config/` actúan sobre el Sistema principal.

## Resultados

Panel muestra el estado del despliegue: la madurez de la organización, el cumplimiento por control y familia, los hallazgos por tipo y la evolución de la puntuación.

Madurez de la organización es la valoración del ENS (Anexo II, apdo. 6): niveles CMM L0 a L5 por medida, acreditados por la evidencia y valorados por las personas, con un nivel global de cada uno y las medidas sin medición, sin valorar y por debajo de su objetivo. La evidencia acredita hasta L2. L3 a L5 exigen un proceso escrito, medido y mejorado: abre el control y pulsa Valorar para registrar el nivel, el objetivo y los documentos que lo acreditan. Cada medida juzgada muestra también Máquinas conformes: las máquinas cuyo control se cumple, el porcentaje y, con una escala en `maturity.scales`, su nivel. Las medidas que citan los controles sin motor, como org.2 o mp.per.3, se valoran en Configuración, Organización, Medidas sin motor. El semáforo y el porcentaje son indicadores operativos, no la valoración del ENS. Exportar métricas (CSV) descarga, por medida, el estado operativo, el cumplimiento, la madurez acreditada, valorada y objetivo, y si cada cifra se midió o se declaró: los datos que recoge op.mon.2 para el informe anual del artículo 32.

Vista general muestra una fila por máquina con su cumplimiento total. Al abrir una máquina se ven sus controles, el trabajo pendiente y los últimos 30 días.

Detalle del control muestra un control en una máquina: cada requisito, cada evidencia con su título, su estado y su motivo, y una explicación de cómo se mide. El icono de información junto al título de una evidencia muestra la descripción de la plantilla. Una evidencia que cuenta elementos, como las copias de mp.info.6, muestra el recuento, el porcentaje y, si hay una escala configurada, el nivel L0 a L5. Seleccionar máquina, arriba en todas las vistas, busca las máquinas en el servidor por nombre, agente, host, grupo de Wazuh, distribución o servicio, con filtros por sistema, grupo de Wazuh y grupo ENS. Aquí es donde se averigua por qué falla algo.

Evidencias lista las evidencias de todos los controles, con su estado por máquina.

Eventos lista los hechos que han enviado los agentes. Muestra lo que ha recibido el motor, y al abrir uno se ve su documento.

Informes genera el informe de cada control para un auditor, con sus requisitos, parámetros, resultados y nivel de madurez. Exportar PDF lo descarga.

## Cómo leer un estado

Controles, requisitos y evidencias llevan un sello de madurez: el nivel CMM a la izquierda y el estado que da a la derecha, con el porcentaje y el nivel exigido en su tooltip. El estado sale del nivel: Cumple si llega al que exige el control (L2 en BÁSICO, L3 en MEDIO, L4 en ALTO), Parcial por debajo y No cumple en el 0 %. Con varias máquinas el porcentaje es la media de las máquinas, así que 9 máquinas conformes de 10 es un 90 %, L4, Cumple; el detalle del control lista las máquinas por debajo del nivel exigido con un enlace a cada una. Madurez del control muestra el porcentaje, el sello y la escala de L0 a L5 con el nivel exigido marcado.

En una evidencia de una máquina, Cumple significa medido y correcto. No cumple significa medido e incorrecto, y el motivo nombra lo que falla. No evaluable significa que no se ha podido medir: falta un parámetro o no ha llegado una fuente. No aplica significa que queda fuera de la categoría del sistema, o que el control o la máquina están fuera de alcance.

Un requisito con una evidencia no evaluable no cumple. Lo que no se puede demostrar no cuenta como cumplido. Las reglas completas están en [Veredictos](https://github.com/arseniteio/oscompliance-ens-wazuh/blob/main/docs/es/verdicts.md).
