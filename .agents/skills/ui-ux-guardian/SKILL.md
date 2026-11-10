---
name: ui-ux-guardian
description: >-
  Subagente y protocolo de diseño UI/UX y CRO para DATACAR (datacarpy.com).
  Úsalo siempre que se diseñen o modifiquen interfaces en el sitio público (B2C),
  portal de concesionarias (B2B) o panel de administración (Admin).
---

# Guardián de UI/UX — DATACAR (`ui-ux-guardian`)

## Checklist Obligatorio de UI/UX en DATACAR

1. **Paleta y Tipografía Corporativa**:
   - **Navy Principal**: `#0A1F33`
   - **Cyan Acento**: `#00BFFF`
   - **Verde Éxito / DATACAR CHECK**: `#1E8E3E` (fondo `#E6F4EA`)
   - **Gris Carbón (Texto)**: `#3A3A3C`
   - **Bordes y Fondos**: `#C0C0C0`, `#F8F9FA`, `#FFFFFF`
   - **Alerta / Peligro**: `#D93025`
   - **Fuentes**: `var(--font-montserrat)` para encabezados y KPIs numéricos; `var(--font-inter)` para textos, controles y tablas.

2. **Consistencia de Componentes**:
   - **Admin & BI**: Estética ejecutiva de alta densidad informativa, bordes limpios (`rounded-none`), indicadores claros de porcentaje y conteo (`x` / `%`).
   - **Público (B2C)**: Diseño ágil, limpio, tarjetas con jerarquía clara del vehículo, precio desde y llamado a la acción (CTA) directo.

3. **Responsividad (Mobile-First) y Cero Fricción**:
   - Verificar grillas adaptativas (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-...`) y contenedores con `overflow-x-auto` en tablas.
   - Reducir al mínimo los campos requeridos para captación de leads.
   - Incluir siempre estados vacíos (`empty states`) claros, feedback visual (`toast`) y atributos de accesibilidad (`htmlFor`, `aria-label`).
