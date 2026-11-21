# Changelog

All notable changes to Power ENS are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- A maturity seal (level and status in one mark, percentage in the tooltip) on controls, requirements, evidences and the compliance index; Madurez del control with the L0 to L5 scale, the required level and the machines below it.
- Escalas de madurez loads the CCN auditor table (20, 40, 60, 80, 100) with one button.

- Evidences that count items show the count, the percentage and the level the engine set. Each judged measure shows Máquinas conformes.
- An attested requirement shows its reference and links.
- The fleet view shows, per requirement, the machines where it complies.
- The configuration accepts and keeps `levelAdjustments`.
- Configuración, Organización edits level adjustments and maturity scales.

### Fixed

- A non-conformity on one machine names that machine.

### Changed

- Across machines a control, a requirement or an evidence is judged by the CMM level of its percentage with the engine's rule, instead of taking the worst machine: 9 compliant machines out of 10 is Cumple. A machine without a score counts as 0 %.
- The day-based level of Madurez de la organización is named Continuidad de la evidencia (30 días).
- The evidence table shows the evidence title; the template description moves to an info icon.
- Parameter descriptions move from the help text to an info icon next to the label.
- The system category reads BÁSICO, MEDIO or ALTO; dimension levels stay BAJO, MEDIO or ALTO.
- Saving the configuration keeps `maturity.scales`.
- The motive of an evidence opens a panel with the check, each parameter it compares against (name, description, full value with search, origin) and the result per machine. Reasons are drawn from the engine's structured reason instead of parsing text; long lists stay whole, with search.
- Non-conformities show the same structured motive and the parameters with their description.
- Non-conformities read as a fixed grid (requirements, machines, motive, parameters compared, action), one per evidence with its machines grouped, with a direct action: configure the parameter, register the document in P-ATT or fix the machine.
- One non-conformity per failed evidence lists every requirement it breaks, instead of one repeated card per requirement.

## [2.0.1] - 2026-11-19

### Changed

- The Windows template declares P-10 1000 and the privileged groups of op.acc.1 P-11, with their English and Spanish names, as vendored from OSCompliance ENS 2.0.1.

## [2.0.0] - 2026-11-18

### Added

- Grupos y máquinas in Configuración. Each group lists its controls and its machines. Cargar plantilla copies a built-in template into a group. Selected machines can be added to a hand-picked group, given a template or given a value at once. Each machine shows its groups, its template (Detectado automáticamente, a fixed type or Sin plantilla) and a Configurar button per control.
- The group editor has four sections (Identificación, Capa, Condiciones, Parámetros) and a live list of the machines the group includes. Importar reads YAML or JSON and shows new, changed, unchanged and invalid groups before applying; Exportar writes YAML in the `oscompliance-policy` format. Edits are collected in one save bar and written together, with a version check against concurrent changes.
- The machine selector searches the server page by page, with filters by system family and group, and scales to thousands of machines.
- Machines show an icon of their system: the Wazuh mark for the manager, and own glyphs for Windows, macOS, Ubuntu, Debian, RHEL, Rocky Linux, AlmaLinux, CentOS, Fedora, Oracle Linux, Amazon Linux and SUSE, with a generic Linux icon as fallback.
- Madurez de la organización at the top of Panel: CMM levels accredited by the engine and assessed by people, distribution, global levels and measures below target. Detalle del control shows the maturity of the control with Valorar, and Informes adds it to the screen and the PDF. Assessments are stored in `configuration.maturity`; the server signs each changed one with the user and the date.
- Exportar métricas (CSV) in Panel downloads, per measure, the operational status, compliance and the accredited, assessed and target maturity, each marked as measured or declared.
- Organización holds twelve shared data items instead of six, and lists the measures the controls cite without an engine (org.2, op.pl.5, op.ext.3, mp.per.3, mp.per.4, mp.com.2, mp.si.5, mp.info.2, mp.sw.1) to assess their maturity. Existing control values move in when they agree and are flagged when they differ.
- Pendiente lists the machines without a group and the unset parameters of the last verdicts, with a link to where each one is set.
- The built-in `windows` group of the OSCompliance catalog. Machines with the OSCompliance agent for Windows, not yet tested on a physical machine, show their verdicts like any other machine.
- `/api/powerEns/profiles`, `/api/powerEns/hosts` and `/api/powerEns/maturity/organization`.
- New runtime dependency `yaml` 2.6.1 (ISC), used by the server to read and write group files.

### Changed

- The repository is now `arseniteio/power-ens-wazuh`, and the release zips are named `power-ens-wazuh-<version>-osd-<osd>.zip`. The plugin ID `powerEns` and its paths do not change.
- The interface uses short labels instead of explanatory text. Explanations sit behind an information icon next to the title.
- Choices are shown as buttons, or as a list with a search box when there are many. The configuration has no dropdown menus, except the fields where a list of values is typed.
- Organización holds the organisation data and the values of each control; General holds the client, the level, the groups in scope and the per-control groups.
- Detalle del control and Informes show the value and origin of each per-machine parameter, as the engine resolves it.
- The usage guide describes the new tabs and the order in which a machine's value is chosen; the installation guide lists the index permissions and the disk each dashboard node needs. `CONTRIBUTING.md` and `CONTRIBUTING.es.md` explain how to propose a change.

### Fixed

- A family in Panel filters its controls and scrolls to them, a whole control row opens its detail, and Informes and Evidencias link to Detalle del control.
- Assigning a template from Valores propios does not ask for a confirmation word.
- The result screens no longer fail with "Maximum call stack size exceeded" on a deployment with thousands of machines.

## [1.2.0] - 2026-11-16

### Changed

- The default ENS level and scope come from `default-configuration.json` of the OSCompliance ENS catalog, which the engine also uses: level MEDIO and the `ens` group.
- Until a configuration is saved, the engine judges with that default, so "Guardar configuración global" (save global configuration) is no longer required before the first verdicts.

### Fixed

- The result screens load on a deployment where no configuration was ever saved, instead of failing because the `wazuh-ens-configuration` index does not exist.

## [1.1.0] - 2026-11-15

### Added

- The "Detalle del control" (control detail) page has the "Excluir de este control" (exclude from this control) and "Volver a incluir" (include again) buttons for users with `power_ens_admin` or `all_access` when "Grupos por control" (per-control groups) is on. The first button moves the machine to the `ens-excluir-<control>` group, the second moves it back, and both require a reason.
- Every exclusion and inclusion is recorded with the machine, control, reason, user and date in the add-only index `wazuh-ens-exclusions`, through `/api/powerEns/exclusions`. If the record fails, the group change is undone.

### Changed

- `SHA256SUMS` in the release also covers `deploy-plugin.sh`, `create-admin-role.sh` and `dashboard.Dockerfile`.
- The installation guide downloads the release with `curl` and `sha256sum`.

## [1.0.0] - 2026-11-13

First release.

### Added

- Configuration screens "Organización" (organisation), "Plantillas" (templates) and "Agentes" (agents), stored in the `wazuh-ens-configuration` index, with built-in templates per system type.
- Result screens "Panel" (dashboard), "Vista general" (overview), "Detalle del control" (control detail), "Evidencias" (evidences), "Eventos" (events) and "Informes" (reports), read from the `oscompliance-verdicts` index. "Informes" exports each control report to PDF.
- Role `power_ens_admin` and `create-admin-role.sh`, which creates it and maps users to it.
- `deploy-plugin.sh`, which validates the zip, keeps a copy of the previous version and installs the plugin.
- `set-parameters.py`, which loads control and machine parameters from a JSON file.
- Plugin builds for OpenSearch Dashboards 2.19.5 (Wazuh 4.14.7) and 2.19.6 (Wazuh 4.14.8 and 4.14.9), and `dashboard.Dockerfile` for Wazuh on Docker.

[Unreleased]: https://github.com/arseniteio/power-ens-wazuh/compare/v2.0.1...HEAD
[2.0.1]: https://github.com/arseniteio/power-ens-wazuh/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/arseniteio/power-ens-wazuh/compare/v1.2.0...v2.0.0
[1.2.0]: https://github.com/arseniteio/power-ens-wazuh/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/arseniteio/power-ens-wazuh/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/arseniteio/power-ens-wazuh/releases/tag/v1.0.0
