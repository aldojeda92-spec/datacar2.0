import type { Metadata } from 'next';
import PromocionesClient from './PromocionesClient';

export const metadata: Metadata = {
  title: 'Promociones y Ofertas 0KM en Paraguay | Datacar',
  description: 'Descubrí las mejores promociones y ofertas en vehículos 0km de las concesionarias oficiales de Paraguay. Bonos, descuentos y condiciones especiales actualizadas.',
};

export default function PromocionesPage() {
  return <PromocionesClient />;
}
