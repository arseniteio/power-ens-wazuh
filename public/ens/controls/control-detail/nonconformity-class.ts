export interface NonConformityClass {
  color: string;
  badgeColor: 'danger' | 'default' | 'warning' | 'primary';
  icon: string;
  label: string;
  action: string;
  owner: string;
  order: number;
}

export const classifyNonConformity = (
  item: { origin?: string; cause?: string; documental?: boolean },
  options: { controlConfigured?: boolean } = {}
): NonConformityClass => {
  if (options.controlConfigured === false && item.origin !== 'MEDIDA' && item.cause !== 'CATALOG') {
    return { label: 'No evidenciado · control sin añadir', icon: 'gear', color: '#F5A700', badgeColor: 'warning', action: 'Añadir el control a la configuración', owner: 'Responsable ENS', order: 3 };
  }
  if (item.origin === 'MEDIDA' && item.documental) {
    return { label: 'Declarado (documental)', icon: 'document', color: '#BD271E', badgeColor: 'danger', action: 'Renovar o completar la documentación', owner: 'Organización (contratos y proveedores)', order: 2 };
  }
  if (item.origin === 'MEDIDA') {
    return { label: 'Medido', icon: 'inspect', color: '#BD271E', badgeColor: 'danger', action: 'Corregir el activo', owner: 'Sistema auditado', order: 1 };
  }
  if (item.cause === 'CATALOG') {
    return { label: 'No evidenciado · catálogo', icon: 'package', color: '#98A2B3', badgeColor: 'default', action: 'Declarar la evidencia', owner: 'Producto Power ENS', order: 6 };
  }
  if (item.cause === 'CONFIGURATION') {
    return { label: 'No evidenciado · sin configurar', icon: 'gear', color: '#F5A700', badgeColor: 'warning', action: 'Declarar la decisión', owner: 'Responsable ENS', order: 3 };
  }
  if (item.cause === 'COLLECTION') {
    return { label: 'No evidenciado · sin recogida', icon: 'offline', color: '#0077CC', badgeColor: 'primary', action: 'Restablecer la recogida', owner: 'Operación Wazuh', order: 4 };
  }
  return { label: 'No evidenciado · evidencia insuficiente', icon: 'alert', color: '#F5A700', badgeColor: 'warning', action: 'Habilitar la prueba', owner: 'Productor de la evidencia', order: 5 };
};
