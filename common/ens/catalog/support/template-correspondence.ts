
export type ENSTemplateCoverage = 'EQUIVALENT' | 'PARTIAL' | 'NOT_MEASURED';

export const ENS_TEMPLATE_COVERAGE_LABELS: Record<ENSTemplateCoverage, string> = {
  EQUIVALENT: 'Equivalente',
  PARTIAL: 'Parcial',
  NOT_MEASURED: 'No se mide todavía',
};

export interface ENSTemplateCorrespondenceRow {
  template: string;
  templateName: string;
  ours: string[];
  coverage: ENSTemplateCoverage;
  note: string;
}

interface ENSTemplateCorrespondence {
  controlId: string;
  title: string;
  summary: string;
  requirements: ENSTemplateCorrespondenceRow[];
  parameters: ENSTemplateCorrespondenceRow[];
  evidences: ENSTemplateCorrespondenceRow[];
  ownOnly: { id: string; note: string }[];
}

const mpInfo6Correspondence: ENSTemplateCorrespondence = {
  controlId: 'mp.info.6',
  title: 'Correspondencia con la plantilla',
  summary:
    'mp.info.6 no se construyó con la plantilla (v2.0, 15/10/2026). Se conservan los parámetros, las evidencias y los requisitos desplegados, porque son los que informan los recolectores del PBS y de Zimbra; esta tabla indica qué parte de la plantilla cubre cada uno y qué no se mide todavía.',
  requirements: [
    { template: 'mp.info.6.1', templateName: 'Copias de seguridad', ours: ['mp.info.6.1'], coverage: 'EQUIVALENT', note: 'Mismo requisito.' },
    {
      template: 'mp.info.6.2',
      templateName: 'Procedimientos de respaldo: a) frecuencia, b) almacenamiento en el propio lugar, c) en otros lugares, d) acceso autorizado',
      ours: ['mp.info.6.2.a', 'mp.info.6.2.b', 'mp.info.6.2.c', 'mp.info.6.2.d'],
      coverage: 'PARTIAL',
      note: 'Partido por letras, como lo informa el despliegue: cada letra es un requisito propio en el porcentaje del control (la base cuenta cinco requisitos, no dos); los identificadores .2.a a .2.d no existen en el BOE. Falta: b) se acredita con la retención de cada copia (P-03, EV-03), no con los requisitos de almacenamiento en el propio lugar (soporte, cifrado); d) con los permisos del repositorio y de la clave (EV-04), sin observar los accesos.',
    },
    { template: 'mp.info.6.r1.1', templateName: 'Pruebas de recuperación (R1)', ours: ['mp.info.6.r1.1'], coverage: 'EQUIVALENT', note: 'Mismo requisito.' },
    { template: 'mp.info.6.r2.1', templateName: 'Protección de las copias de seguridad (R2)', ours: ['mp.info.6.r2.1'], coverage: 'EQUIVALENT', note: 'Mismo requisito.' },
  ],
  parameters: [
    { template: 'P-01', templateName: 'alcance_copias', ours: ['P-04'], coverage: 'PARTIAL', note: 'Sistemas del alcance con su criticidad; no se declara el RPO.' },
    { template: 'P-02', templateName: 'frecuencia_copias', ours: ['P-01', 'P-02'], coverage: 'PARTIAL', note: 'Una frecuencia única en horas más un margen; la plantilla pide la frecuencia por alcance.' },
    { template: 'P-03', templateName: 'retencion_copias', ours: ['P-03'], coverage: 'PARTIAL', note: 'Una retención única en días; la plantilla pide la retención por alcance.' },
    { template: 'P-04', templateName: 'almacenamiento_propio_lugar', ours: ['P-06', 'P-11'], coverage: 'PARTIAL', note: 'Ruta local (informativa) y clave de cifrado de las copias; no se declaran soporte ni cifrado por alcance.' },
    { template: 'P-05', templateName: 'almacenamiento_otros_lugares', ours: ['P-08', 'P-09'], coverage: 'PARTIAL', note: 'Existencia y destino del repositorio remoto; no se declara la separación (eléctrica, de red, distancia).' },
    { template: 'P-06', templateName: 'controles_acceso_copias', ours: ['P-07'], coverage: 'PARTIAL', note: 'Lista de cuentas y procesos autorizados; sin el permiso de cada cuenta (escritura, restauración, borrado).' },
    { template: 'P-07', templateName: 'sistema_respaldo', ours: ['P-10'], coverage: 'EQUIVALENT', note: 'Origen de los hechos: PBS o Zimbra 10 Network Edition.' },
    { template: 'P-08', templateName: 'periodicidad_pruebas_restauracion', ours: ['P-05', 'P-14'], coverage: 'PARTIAL', note: 'Plazo máximo sin prueba y cadencia de la prueba automática, únicos; la plantilla pide la periodicidad por criticidad.' },
    { template: 'P-09', templateName: 'registro_pruebas_restauracion', ours: [], coverage: 'NOT_MEASURED', note: 'No hay registro declarado: la prueba automática se mide en el activo (EV-05); las pruebas manuales, su duración y su verificación no se registran.' },
  ],
  evidences: [
    { template: 'EV-01', templateName: 'Ejecución y resultado de las copias de seguridad', ours: ['EV-01'], coverage: 'EQUIVALENT', note: 'Resultado de la última ejecución de cada copia; una copia que omite puntos de montaje no cumple.' },
    { template: 'EV-02', templateName: 'Antigüedad de la última copia frente a la frecuencia exigida', ours: ['EV-02'], coverage: 'PARTIAL', note: 'Antigüedad y planificación de cada copia frente a un umbral único, no por alcance.' },
    { template: 'EV-03', templateName: 'Cobertura del respaldo frente al alcance declarado', ours: [], coverage: 'NOT_MEASURED', note: 'Solo se señalan los activos de P-04 de las que no llegan datos; no se reconcilian los elementos del alcance con los trabajos de copia.' },
    { template: 'EV-04', templateName: 'Creación de las copias en los destinos declarados', ours: ['EV-06'], coverage: 'PARTIAL', note: 'Destinos de cada copia (local, montaje, remoto) y si están activos; no el fichero ni su tamaño en el destino.' },
    { template: 'EV-05', templateName: 'Existencia y frescura de la copia en lugar separado (R2)', ours: ['EV-06'], coverage: 'PARTIAL', note: 'Existencia de un destino operativo fuera del activo; no se mide la antigüedad de la copia remota.' },
    { template: 'EV-06', templateName: 'Accesos y operaciones sobre los repositorios de copia', ours: ['EV-04'], coverage: 'PARTIAL', note: 'Quién puede leer el repositorio y la clave de cifrado (permisos); no se registran los accesos ni las operaciones uno a uno.' },
    { template: 'EV-07', templateName: 'Eliminación anómala o masiva de copias', ours: [], coverage: 'NOT_MEASURED', note: 'Necesita que el recolector emita los borrados de copias y una regla de correlación en ventana corta.' },
    { template: 'EV-08', templateName: 'Cumplimiento de la retención declarada', ours: ['EV-03'], coverage: 'PARTIAL', note: 'Retención configurada frente a P-03 y copia más antigua conservada; no se detectan borrados antes de plazo.' },
    { template: 'EV-09', templateName: 'Registro y seguimiento de las pruebas de restauración (R1)', ours: ['EV-05'], coverage: 'PARTIAL', note: 'Prueba automática del testigo frente al plazo único de P-05, no por criticidad.' },
    { template: 'EV-10', templateName: 'Medición objetiva de las pruebas de restauración (R1)', ours: ['EV-05'], coverage: 'PARTIAL', note: 'Se comprueba el contenido restaurado (SHA-256 en el PBS; cuenta y entrada testigo en Zimbra); no se miden duración ni volumen.' },
    { template: 'EV-11', templateName: 'Cifrado y protección del repositorio de copias', ours: [], coverage: 'NOT_MEASURED', note: 'EV-04 solo comprueba los permisos de la clave de cifrado; el cifrado del repositorio no se verifica.' },
  ],
  ownOnly: [
    { id: 'EV-07', note: 'Latido del recolector de copias: sin una pasada reciente, los demás hechos no describen el estado de hoy.' },
    { id: 'P-12', note: 'Fichero que se restaura en la prueba (informativo).' },
    { id: 'P-13', note: 'Fichero canario de la prueba (informativo).' },
    { id: 'P-ATT', note: 'Atestaciones documentales.' },
  ],
};

const correspondences: ENSTemplateCorrespondence[] = [mpInfo6Correspondence];

export const getTemplateCorrespondence = (controlId: string): ENSTemplateCorrespondence | undefined =>
  correspondences.find(entry => entry.controlId === controlId);
