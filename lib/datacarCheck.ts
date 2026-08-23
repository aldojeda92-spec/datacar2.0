// lib/datacarCheck.ts
// DATACAR CHECK certifica que una concesionaria es socia oficial y que asumió
// la responsabilidad de mantener actualizados sus propios precios y productos
// en la plataforma. El sello vive en el documento de la concesionaria
// (`concesionarias/{id}.datacarCheck`) y se propaga automáticamente a toda
// versión cuyo campo `concesionaria` (nombre comercial) coincida: no hace
// falta marcar producto por producto.

// Los campos son opcionales para poder aceptar directamente los documentos
// crudos de Firestore (`RawDoc` en lib/catalogCache.ts) sin necesidad de cast.
export interface ConcesionariaCheckInfo {
  id?: string;
  name?: string;
  datacarCheck?: boolean;
}

const normalizarNombre = (nombre: string | undefined | null): string => (nombre || '').trim().toUpperCase();

/** Set de nombres normalizados de concesionarias con el sello DATACAR CHECK activo. */
export function buildCheckedDealershipSet(concesionarias: ConcesionariaCheckInfo[]): Set<string> {
  return new Set(
    concesionarias
      .filter((c) => c.datacarCheck === true)
      .map((c) => normalizarNombre(c.name))
  );
}

/** Indica si un producto (por el nombre de su concesionaria) hereda el sello DATACAR CHECK. */
export function isDatacarCheck(concesionariaNombre: string | undefined | null, checkedSet: Set<string>): boolean {
  if (!concesionariaNombre) return false;
  return checkedSet.has(normalizarNombre(concesionariaNombre));
}

export const DATACAR_CHECK_TITLE = 'DATACAR CHECK';

export const DATACAR_CHECK_SHORT = 'Concesionaria oficial: precio y datos validados por la marca.';

export const DATACAR_CHECK_BODY =
  'DATACAR CHECK identifica a las concesionarias asociadas oficialmente a DATACAR y a los vehículos que ellas mismas gestionan en nuestra plataforma. Al asociarse, la concesionaria asume la responsabilidad de mantener actualizados sus propios precios, stock y condiciones comerciales. Por eso, todo producto con el sello DATACAR CHECK muestra información cargada y validada directamente por el equipo comercial oficial de la marca, no por terceros.';
