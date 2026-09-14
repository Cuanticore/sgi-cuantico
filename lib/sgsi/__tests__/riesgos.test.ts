// lib/sgsi/__tests__/riesgos.test.ts
//
// REQ-SIG-20 D4 (tarea 1.8) · `RiesgoCalculo` es una tabla sin escritor: el único
// mencionador en producción hoy es `consolidado-carga.ts:362`, que la vacía en cada carga
// completa. Esta tarea le da su primer escritor, dentro de `generarRiesgos`.
//
// `generarRiesgos` en sí es cableado — toca Prisma extensamente (activos, amenazas,
// controles, excepciones, `$transaction` implícito por llamada) — así que, siguiendo la
// convención del repo («las decisiones se prueban, el cableado no»; ver AGENTS.md y la
// regla de higiene de mocks del módulo TDD: 7+ mocks es la señal de estar probando en la
// capa equivocada), la parte que SÍ es una decisión pura se extrajo a
// `construirSnapshotCalculo` y se prueba acá sin ningún mock. El `createMany` batched que
// la llama se verifica corriendo contra la base de desarrollo (docker-compose.dev.yml),
// igual que el resto de `generarRiesgos`.
//
// LA GUARDA QUE ESTO PRUEBA, Y POR QUÉ EXISTE: `RiesgoCalculo.frecuenciaResidual` y
// `.riesgoResidual` son `Decimal` NOT NULL en el esquema (prisma/schema.prisma:846-847),
// pero el dominio dice que un residual con eficacia desconocida es DESCONOCIDO, no cero
// (invariante 1). Escribir 0 ahí sería exactamente el defecto que ese invariante prohíbe,
// y tocar el esquema para volver esas columnas nullable está fuera de alcance de esta fase
// (la única migración permitida es la de criticidad, en la Fase 4). Por eso
// `construirSnapshotCalculo` devuelve `null` — sin fila — cuando el residual no se conoce.
//
// **Verificado contra la base de desarrollo** (2026-09-14, corrida real de
// `generarRiesgos`, sin tocar esquema ni datos): los 37 activos en análisis YA tienen al
// menos un `ControlAmenaza` por amenaza hoy, así que `eficaciaPorAmenaza` nunca devuelve
// null para ellos y los 722 riesgos no obsoletos SÍ recibieron su fila de `RiesgoCalculo`
// en esa corrida — la tarea 1.8 se cumple tal como está escrita para el dataset actual. La
// rama de "residual desconocido" de abajo es una red de seguridad para el día en que una
// amenaza quede sin ningún control mapeado, no el caso común de hoy.

import { construirSnapshotCalculo } from '../riesgos';
import { calcularRiesgo, type EntradaRiesgo } from '../formulas';

const ENTRADA_CONOCIDA: EntradaRiesgo = {
  valores: { D: 5, I: 5, C: 5 },
  degradaciones: { D: '1.00', I: '0.80', C: '0.50' },
  aro: 12,
  eficacia: 0.6,
};

describe('construirSnapshotCalculo (D4, tarea 1.8)', () => {
  it('con la eficacia conocida, arma la fila con los cuatro decimales del cálculo', () => {
    const salida = calcularRiesgo(ENTRADA_CONOCIDA);
    const fila = construirSnapshotCalculo(42, ENTRADA_CONOCIDA, salida, true);

    expect(fila).not.toBeNull();
    expect(fila!.riesgoId).toBe(42);
    expect(fila!.impacto).toBe(salida.impacto.toString());
    expect(fila!.riesgoPotencial).toBe(salida.riesgoPotencial.toString());
    expect(fila!.frecuenciaResidual).toBe(salida.frecuenciaResidual.toString());
    expect(fila!.riesgoResidual).toBe(salida.riesgoResidual.toString());
    expect(fila!.entrada).toMatchObject({
      valores: ENTRADA_CONOCIDA.valores,
      degradaciones: ENTRADA_CONOCIDA.degradaciones,
    });
  });

  it('con la eficacia desconocida, no arma fila: invariante 1 — desconocido no es cero', () => {
    // Misma entrada aritmética; solo cambia la bandera de "residual conocido", que es
    // externa a `calcularRiesgo` (la decide `generarRiesgos` a partir de si el control
    // tiene relevancia asignada).
    const salida = calcularRiesgo(ENTRADA_CONOCIDA);
    const fila = construirSnapshotCalculo(42, ENTRADA_CONOCIDA, salida, false);
    expect(fila).toBeNull();
  });

  it('triangulación: otra entrada, otro riesgoId, sigue devolviendo sus propios decimales', () => {
    const otra: EntradaRiesgo = {
      valores: { D: 3, I: 4, C: 2 },
      degradaciones: { D: '0.50', I: '1.00', C: '0.20' },
      aro: 4,
      eficacia: 0.2,
    };
    const salida = calcularRiesgo(otra);
    const fila = construirSnapshotCalculo(7, otra, salida, true);

    expect(fila).not.toBeNull();
    expect(fila!.riesgoId).toBe(7);
    expect(fila!.impacto).toBe(salida.impacto.toString());
    expect(fila!.riesgoResidual).toBe(salida.riesgoResidual.toString());
    // Y NO son los mismos números que la primera entrada — si lo fueran, la función
    // estaría ignorando su argumento de entrada.
    expect(fila!.impacto).not.toBe(calcularRiesgo(ENTRADA_CONOCIDA).impacto.toString());
  });
});
