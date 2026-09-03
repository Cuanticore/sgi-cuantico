// lib/sig/__tests__/generacion-anclaje.test.ts
//
// R12 · el anclaje de la periodicidad. La regla que el control de integración listaba
// como pendiente: especificada en REQ-SIG-02, sin `ANCLADA`/`FLOTANTE` en el esquema.
//
// La diferencia entera está en de dónde salen los periodos. `ANCLADA` los saca del
// CALENDARIO; `FLOTANTE` los saca del CIERRE del ciclo anterior. Los tres casos del
// flotante —sin ciclo previo, previo cerrado, previo abierto— son toda la regla.

import { planificarGeneracion } from '../generacion';

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

const HOY = d('2026-09-15');
const ADA = { id: 1, activa: true, areaId: 3, cargoId: 7 };

const base = {
  id: 1,
  contenidoId: 10,
  alcance: 'PERSONA' as const,
  alcancePersonaId: ADA.id,
  alcanceCargoId: null,
  alcanceAreaId: null,
  alcanceActivoId: null,
  alcanceTipoActivoId: null,
  alcanceNivelActivoId: null,
  responsableSeguimientoId: 99,
  periodicidad: 'ANUAL' as const,
  fechaInicio: d('2024-06-11'),
  plazoDias: 15,
  activa: true,
};

describe('R12 · ANCLADA — el trimestre existió aunque nadie lo mirara', () => {
  it('genera el periodo siguiente aunque el anterior siga abierto', () => {
    const anclada = { ...base, anclaje: 'ANCLADA' as const, periodicidad: 'TRIMESTRAL' as const, fechaInicio: d('2026-01-01') };
    // El T3 está abierto y sin cerrar. El calendario no le pide permiso.
    const plan = planificarGeneracion(
      [anclada],
      [ADA],
      [{ obligacionId: 1, personaId: ADA.id, periodo: '2026-T3', activoId: null, fechaApertura: d('2026-07-01'), fechaCierre: null }],
      HOY,
    );
    expect(plan.crear.map((c) => c.periodo)).toContain('2026-T4');
  });

  it('sin anclaje declarado se comporta como ANCLADA', () => {
    // Ninguna obligación existente cambia de conducta al agregarse el campo. Es la razón
    // por la que el campo es opcional en la entrada y no obligatorio.
    const sinCampo = { ...base, periodicidad: 'TRIMESTRAL' as const, fechaInicio: d('2026-01-01') };
    const conCampo = { ...sinCampo, anclaje: 'ANCLADA' as const };
    const a = planificarGeneracion([sinCampo], [ADA], [], HOY);
    const b = planificarGeneracion([conCampo], [ADA], [], HOY);
    expect(a.crear.map((c) => c.periodo)).toEqual(b.crear.map((c) => c.periodo));
  });
});

describe('R12 · FLOTANTE — el siguiente nace al cerrar el previo', () => {
  const flotante = { ...base, anclaje: 'FLOTANTE' as const };

  it('sin ciclo previo, arranca uno en la fecha de inicio', () => {
    const plan = planificarGeneracion([flotante], [ADA], [], HOY);
    expect(plan.crear).toHaveLength(1);
    expect(plan.crear[0].periodo).toBe('2024-06-11');
    expect(plan.crear[0].fechaApertura).toEqual(d('2024-06-11'));
    // El plazo se cuenta desde la apertura, igual que en el anclado.
    expect(plan.crear[0].fechaLimite).toEqual(d('2024-06-26'));
  });

  it('con el previo CERRADO, el siguiente abre el día del cierre', () => {
    const plan = planificarGeneracion(
      [flotante],
      [ADA],
      [{ obligacionId: 1, personaId: ADA.id, periodo: '2024-06-11', activoId: null, fechaApertura: d('2024-06-11'), fechaCierre: d('2025-06-20') }],
      HOY,
    );
    expect(plan.crear).toHaveLength(1);
    expect(plan.crear[0].fechaApertura).toEqual(d('2025-06-20'));
    expect(plan.crear[0].periodo).toBe('2025-06-20');
  });

  it('con el previo ABIERTO no genera NADA — y ése es el costo del flotante', () => {
    // No es un defecto: es lo que «flotante» significa. Una obligación flotante que nadie
    // cierra deja de generar, y su primera asignación vencida es el único aviso que habrá.
    // Generar igual la convertiría en una anclada con otro nombre.
    const plan = planificarGeneracion(
      [flotante],
      [ADA],
      [{ obligacionId: 1, personaId: ADA.id, periodo: '2024-06-11', activoId: null, fechaApertura: d('2024-06-11'), fechaCierre: null }],
      HOY,
    );
    expect(plan.crear).toHaveLength(0);
  });

  it('toma el ÚLTIMO ciclo, no el primero que aparezca en la lista', () => {
    const plan = planificarGeneracion(
      [flotante],
      [ADA],
      [
        // Deliberadamente desordenadas: el más reciente va primero.
        { obligacionId: 1, personaId: ADA.id, periodo: '2025-06-20', activoId: null, fechaApertura: d('2025-06-20'), fechaCierre: d('2026-07-15') },
        { obligacionId: 1, personaId: ADA.id, periodo: '2024-06-11', activoId: null, fechaApertura: d('2024-06-11'), fechaCierre: d('2025-06-20') },
      ],
      HOY,
    );
    expect(plan.crear).toHaveLength(1);
    expect(plan.crear[0].fechaApertura).toEqual(d('2026-07-15'));
  });

  it('sin fecha de cierre visible en la entrada, no inventa un ciclo', () => {
    // `fechaCierre` ausente (no `null`) es lo mismo que abierto: si el llamador no trae el
    // dato, generar sería adivinar, y el vencimiento avisa mejor que una adivinanza.
    const plan = planificarGeneracion(
      [flotante],
      [ADA],
      [{ obligacionId: 1, personaId: ADA.id, periodo: '2024-06-11', activoId: null }],
      HOY,
    );
    expect(plan.crear).toHaveLength(0);
  });

  it('cada destinatario lleva su propio ciclo', () => {
    // Dos personas con la misma obligación flotante: que una cierre no le abre el ciclo a
    // la otra. Por eso el periodo flotante se calcula por destinatario y no una vez.
    const GRACE = { id: 2, activa: true, areaId: 3, cargoId: 8 };
    const paraTodos = { ...flotante, alcance: 'TODOS' as const, alcancePersonaId: null };
    const plan = planificarGeneracion(
      [paraTodos],
      [ADA, GRACE],
      [{ obligacionId: 1, personaId: ADA.id, periodo: '2024-06-11', activoId: null, fechaApertura: d('2024-06-11'), fechaCierre: null }],
      HOY,
    );
    // Ada tiene un ciclo abierto: no genera. Grace no tiene ninguno: arranca el primero.
    expect(plan.crear).toHaveLength(1);
    expect(plan.crear[0].personaId).toBe(GRACE.id);
  });

  it('la etiqueta es la fecha de apertura, no la del calendario', () => {
    // Dos ciclos flotantes pueden caer en el mismo trimestre; la etiqueta del calendario
    // los colapsaría contra la unique de idempotencia y el segundo nunca nacería.
    const plan = planificarGeneracion(
      [{ ...flotante, periodicidad: 'TRIMESTRAL' as const }],
      [ADA],
      [{ obligacionId: 1, personaId: ADA.id, periodo: '2024-06-11', activoId: null, fechaApertura: d('2024-06-11'), fechaCierre: d('2026-08-05') }],
      HOY,
    );
    expect(plan.crear[0].periodo).toBe('2026-08-05');
    expect(plan.crear[0].periodo).not.toBe('2026-T3');
  });
});
