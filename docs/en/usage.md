# Usage

Power ENS appears in the Wazuh dashboard menu. The screens are in Spanish, so this page names them as they appear. All results come from the OSCompliance engine, which runs every 15 minutes: a change made here shows after its next pass.

## Configuration

Configuración holds what the organisation declares. Explanations of each section are behind the information icon next to its title. Anyone with dashboard access can read it; saving needs the `power_ens_admin` or `all_access` role. It has four tabs.

Grupos y máquinas is where values are set per group of machines. The list on the left shows the groups, how many machines each has and whether it has values, and Sin grupo for the machines in none. A machine enters a group because it meets its conditions (distribution, family, role, service, Wazuh group, host name) or because it was added by hand. Each group has two views:

- Controles lists the controls with per-machine parameters. Configurar opens the values the group gives to all its machines.
- Máquinas lists its machines, with their operating system, page by page and with a search. Selecting several shows Añadir a grupo, Sacar del grupo (in a group chosen by hand), Plantilla and Fijar valor.

Cargar plantilla copies the values of a built-in template (Ubuntu, Windows, manager) into the group; values the group already had for the same parameters are replaced. Editar grupo opens the group in four sections, Identificación, Capa, Condiciones and Parámetros, with the list of machines it includes. Nuevo starts a group from scratch, from a copy or from a file; Exportar writes the groups as YAML.

Opening a machine shows its groups, its plantilla and its controls. The plantilla gives starting values by system type: Detectado automáticamente, one chosen by hand, or Sin plantilla, in which case it takes only the values of its groups and its own. Configurar on a control opens its parameters with where each value comes from (the machine, a group, the plantilla or the organisation); what is changed there applies to that machine only.

Edits to groups are collected in the bar at the bottom of the page. Revisar lists them, Descartar drops them and Guardar writes them all. Plantilla and per-machine values are saved at once. The engine applies everything on its next pass.

Pendiente lists what needs a decision: machines in no group and parameters without a value that leave evidences not evaluable, according to the last verdicts. Each parameter links to where it is set: a group for per-machine parameters, Organización for the rest.

Organización holds the data that several controls share, entered once: authorised personnel, preproduction environment, change and incident tools, CCN-authorised algorithms, retention periods, controlled zones, remote access channels, certified products, staff training, awareness activities, privileged groups and the statement of applicability. Each control reads the rows of its use. It also holds the values of each control that apply to the whole organisation. Open a control and press Completar configuración to fill in what is missing. A control also lets a template be assigned to some machines.

Organización also holds Ajustes de nivel and Escalas de madurez. An adjustment judges one control, on every machine or on one, at a lower level than the one in force, and needs a reason. A scale sets the minimum percentage of conforming items for L1 to L5 in the evidences that count items; without one the engine uses the table provided by a CCN auditor: 20, 40, 60, 80 and 100 %. Tabla del CCN loads it into a scale. L2 meets BÁSICO, L3 MEDIO and L4 ALTO.

General holds the client, the system category (BÁSICO, MEDIO or ALTO), the groups in scope (Grupos evaluables) and Grupos por control. Until Guardar configuración global is pressed for the first time, the engine and the plugin use the default of the catalog, `common/ens/catalog/default-configuration.json`: category MEDIO and the `ens` group in scope. Save to change them.

A machine's value comes from the first of: its own value, the template assigned to it in the control, its groups, its plantilla, and the organisation value. Lists add up across groups; other values come from the most specific layer. The order is described in [ENS policy](https://github.com/arseniteio/oscompliance-ens-wazuh/blob/main/docs/en/configuration.md#ens-policy).

For automation, `oscompliance-policy` reads and writes the same groups, stored as profiles, from YAML files on the manager, and `config/set-parameters.py` fills in organisation and machine values from a JSON file after the first save. See [profiles](https://github.com/arseniteio/oscompliance-ens-wazuh/blob/main/docs/en/configuration.md#profiles) and [parameters from a file](https://github.com/arseniteio/oscompliance-ens-wazuh/blob/main/docs/en/configuration.md#parameters-from-a-file).

A parameter nobody has set is never replaced by an assumption: the evidences that need it show as not evaluable, and the reason names the machine, the parameter and the value in force or its absence. The info icon next to each parameter shows its description. What each parameter means is on the [control pages](https://github.com/arseniteio/oscompliance-ens-wazuh/tree/main/docs/en/controls).

With Grupos por control on, the engine creates one Wazuh group per control, `ens-excluir-<control>`. A machine added to one of those groups is left out of that control. In Detalle del control, a user with `power_ens_admin` or `all_access` presses Excluir de este control to move the machine to that group, and must write a reason. Power ENS records the machine, control, reason, user and date in the `wazuh-ens-exclusions` index. Volver a incluir reverses it, also with a reason. The manager belongs to no group and cannot be excluded.

## Results

Panel shows the state of the deployment: the maturity of the organization, compliance per control and family, the findings by kind, and how the score has changed over time.

Madurez de la organización is the ENS valuation (Anexo II, apdo. 6): CMM levels L0 to L5 per measure, as accredited by the evidence and as assessed by people, with a global level for each and the measures without measurement, without assessment and below their target. The evidence accredits up to L2. L3 to L5 need a written, measured and improved process: open the control and press Valorar to record the level, the target and the documents that prove it. Each judged measure also shows Máquinas conformes: the machines whose control complies, the percentage and, with a scale in `maturity.scales`, its level. The measures the controls cite without an engine, such as org.2 or mp.per.3, are assessed in Configuración, Organización, Medidas sin motor. The traffic light and the percentage are operational indicators, not the ENS valuation. Exportar métricas (CSV) downloads, per measure, the operational status, the compliance, the accredited, assessed and target maturity, and whether each figure was measured or declared: the data op.mon.2 collects for the annual report of article 32.

Vista general shows one row per machine with its total compliance. Opening a machine shows its controls and the work pending on it, and the last 30 days.

Detalle del control shows one control on one machine: each requirement, each evidence with its title, status and reason, and an explanation of how it is measured. The info icon next to an evidence title shows the description of the template. An evidence that counts items, such as the copies of mp.info.6, shows the count, the percentage and, when a scale is configured, the level L0 to L5. Seleccionar máquina, at the top of every view, searches the machines in the server with filters by system and group. This is where to go to find out why something fails.

Evidencias lists the evidences of all controls, with their status per machine.

Eventos lists the facts the agents have sent. It shows what the engine received, and opening one shows its document.

Informes builds the report of each control for an auditor, with its requirements, parameters, results and maturity level. Exportar PDF downloads it.

## Reading a status

Controls, requirements and evidences carry a maturity seal: the CMM level on the left and the status it gives on the right, with the percentage and the required level in its tooltip. The status comes from the level: Cumple when it reaches the level the control requires (L2 at BÁSICO, L3 at MEDIO, L4 at ALTO), Parcial below it, No cumple at 0 %. Across machines the percentage is the average of the machines, so 9 compliant machines out of 10 is 90 %, L4, Cumple; the control detail lists the machines below the required level with a link to each. Madurez del control shows the percentage, the seal and the scale from L0 to L5 with the required level marked.

For an evidence on one machine, Cumple means measured and correct. No cumple means measured and wrong, and the reason names what failed. No evaluable means it could not be measured: a parameter is missing, or a source did not arrive. No aplica means it is outside the system category, or the control or machine is out of scope.

A requirement with an evidence that is not evaluable does not comply. What cannot be proven does not count as compliant. The full rules are in [Verdicts](https://github.com/arseniteio/oscompliance-ens-wazuh/blob/main/docs/en/verdicts.md).
