// lib/sig/__tests__/trabajos.test.ts
//
// El catalogo de trabajos programados. Lo que se prueba aca es la parte que NO toca la
// base: que el catalogo sea coherente y que un trabajo declarado sin construir no se
// confunda con uno que no existe.
//
// La distincion importa porque decide el codigo HTTP de la ruta: 404 manda a alguien a
// buscar un error de escritura en el crontab; 501 dice «el nombre esta bien, el modulo no
// esta». Con la respuesta equivocada se pierde una tarde.

import {
  TRABAJOS,
  trabajoPorNombre,
  AUTOR_SISTEMA,
  estadoDeTrabajo,
  saludDelSistema,
  type UltimaCorrida,
} from '../trabajos-catalogo';

describe('el catalogo', () => {
  // Los ocho del documento, mas el de envios que agrupa tres. Si alguien agrega o quita
  // uno, esta prueba obliga a mirar el documento antes de que el crontab quede desfasado.
  it('declara los trabajos del documento', () => {
    const nombres = TRABAJOS.map((t) => t.nombre);
    expect(nombres).toContain('generar-asignaciones');
    expect(nombres).toContain('marcar-vencidas');
    expect(nombres).toContain('enviar-notificaciones');
    expect(nombres).toContain('sincronizar-directorio');
    expect(nombres).toContain('excepciones-vencidas');
    expect(nombres).toContain('permisos-temporales-vencidos');
  });

  it('ningun nombre se repite', () => {
    const nombres = TRABAJOS.map((t) => t.nombre);
    expect(new Set(nombres).size).toBe(nombres.length);
  });

  // Un nombre con espacios o mayusculas no sobrevive a una URL sin que alguien lo escape,
  // y el crontab lo escribe a mano.
  it('los nombres son seguros en una URL', () => {
    for (const t of TRABAJOS) {
      expect(t.nombre).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  it('todos dicen cuando corren y que hacen', () => {
    for (const t of TRABAJOS) {
      expect(t.cuando.length).toBeGreaterThan(3);
      // La descripcion de uno NO disponible tiene que explicar por que: es lo que la ruta
      // devuelve en el 501, y «no esta construido» a secas no dice si falta un modulo o
      // si la decision esta en el comite.
      expect(t.descripcion.length).toBeGreaterThan(20);
    }
  });

  // `marcar-vencidas` esta declarado y NO se construye a proposito: el vencimiento es
  // derivado (invariante 1) y no hay columna que actualizar. Si algun dia alguien lo
  // implementa, esta prueba lo obliga a explicar por que.
  it('marcar-vencidas queda sin construir porque el vencimiento es derivado', () => {
    const t = trabajoPorNombre('marcar-vencidas');
    expect(t?.disponible).toBe(false);
    expect(t?.descripcion).toContain('DERIVADO');
  });
});

describe('trabajoPorNombre', () => {
  it('encuentra el que existe', () => {
    expect(trabajoPorNombre('generar-asignaciones')?.nombre).toBe('generar-asignaciones');
  });

  // `null` y no una excepcion: la ruta necesita distinguir «no existe» (404) de «existe y
  // no esta construido» (501), y una excepcion colapsaria los dos en un 500.
  it('devuelve null cuando no existe, no una excepcion', () => {
    expect(trabajoPorNombre('generar-asignacion')).toBeNull();
    expect(trabajoPorNombre('')).toBeNull();
  });
});

describe('AUTOR_SISTEMA', () => {
  // Un registro de bitacora firmado por una persona que estaba durmiendo es peor que uno
  // firmado por el sistema: el autor de la bitacora es evidencia de auditoria.
  it('no se puede confundir con una persona', () => {
    expect(AUTOR_SISTEMA).toContain('sistema');
    expect(AUTOR_SISTEMA).not.toContain('@cuantico.com');
  });
});

describe('estadoDeTrabajo — nunca corrió NO es al día', () => {
  const ahora = new Date('2026-09-04T15:00:00.000Z');
  const hace = (horas: number) => new Date(ahora.getTime() - horas * 3_600_000);
  const u = (horas: number, resultado: UltimaCorrida['resultado'] = 'EXITOSO'): UltimaCorrida => ({
    trabajo: 'x',
    inicio: hace(horas),
    resultado,
  });

  it('un trabajo que jamás se ejecutó se reporta como tal', () => {
    // Es exactamente el que nadie nota que falta; pintarlo de verde sería el defecto que
    // esta pantalla existe para evitar.
    expect(estadoDeTrabajo('Diario, 05:00', null, ahora)).toBe('NUNCA_CORRIO');
  });

  it('un diario que corrió ayer está al día', () => {
    expect(estadoDeTrabajo('Diario, 05:00', u(20), ahora)).toBe('AL_DIA');
  });

  it('un diario con más de dos días está atrasado', () => {
    expect(estadoDeTrabajo('Diario, 05:00', u(50), ahora)).toBe('ATRASADO');
  });

  it('el margen extra evita la alarma diaria a la hora del cron', () => {
    // Un cron de las 05:00 mirado a las 04:00 del día siguiente lleva 23 h: no está
    // atrasado. Una tolerancia justa produciría una alarma diaria que la gente ignoraría.
    expect(estadoDeTrabajo('Diario, 05:00', u(23), ahora)).toBe('AL_DIA');
  });

  it('un semanal aguanta ocho días, no dos', () => {
    expect(estadoDeTrabajo('Semanal, lunes 07:00', u(24 * 7), ahora)).toBe('AL_DIA');
    expect(estadoDeTrabajo('Semanal, lunes 07:00', u(24 * 9), ahora)).toBe('ATRASADO');
  });

  it('el FALLO manda sobre el atraso', () => {
    // Decir «al día» porque corrió hace una hora sería contar la hora y callar el resultado.
    expect(estadoDeTrabajo('Diario, 05:00', u(1, 'FALLIDO'), ahora)).toBe('FALLIDO');
  });

  it('una corrida PARCIAL no se toma por fallo', () => {
    // Parcial es «hizo parte»: no es exito y no es falla, y colapsarla en fallo escondería
    // que algo si se hizo.
    expect(estadoDeTrabajo('Diario, 05:00', u(1, 'PARCIAL'), ahora)).toBe('AL_DIA');
  });

  it('un `cuando` que no se reconoce no se da por bueno automáticamente', () => {
    expect(estadoDeTrabajo('cuando alguien se acuerde', u(24 * 40), ahora)).toBe('ATRASADO');
  });
});

describe('saludDelSistema — sólo lo que ABRE PERIODOS decide si medimos', () => {
  it('con la generación atrasada, el sistema NO está midiendo', () => {
    const r = saludDelSistema([{ trabajo: 'generar-asignaciones', estado: 'ATRASADO' }]);
    expect(r.midiendo).toBe(false);
    expect(r.culpables).toEqual(['generar-asignaciones']);
  });

  it('un correo caído NO atenúa el tablero', () => {
    // Los indicadores siguen siendo ciertos: nadie recibió el aviso, pero las tareas
    // existen. Mezclarlo haría que la gente aprendiera a ignorar la banda.
    const r = saludDelSistema([
      { trabajo: 'generar-asignaciones', estado: 'AL_DIA' },
      { trabajo: 'correo-semanal', estado: 'FALLIDO' },
    ]);
    expect(r.midiendo).toBe(true);
  });

  it('nunca haber corrido también rompe la medición', () => {
    expect(saludDelSistema([{ trabajo: 'generar-asignaciones', estado: 'NUNCA_CORRIO' }]).midiendo).toBe(
      false,
    );
  });

  it('con todo al día, mide', () => {
    expect(saludDelSistema([{ trabajo: 'generar-asignaciones', estado: 'AL_DIA' }]).midiendo).toBe(true);
  });
});
