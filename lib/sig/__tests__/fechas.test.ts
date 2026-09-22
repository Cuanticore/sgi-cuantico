// lib/sig/__tests__/fechas.test.ts
//
// La comparación por día calendario y su frontera: el día del plazo todavía está en plazo,
// la hora no cuenta, y el fin de mes no es un caso especial. Lo que estas pruebas fijan de
// verdad es la superficie: el módulo no expone el entero empaquetado, así que el defecto
// que se repitió cuatro veces —restarlo— ya no se puede escribir.

import { dia, esDiaPosterior, esDiaPosteriorOIgual } from '../fechas';

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

describe('esDiaPosterior', () => {
  it('el día del plazo todavía no venció', () => {
    expect(esDiaPosterior(d('2026-09-10'), d('2026-09-10'))).toBe(false);
  });

  it('vence al día siguiente', () => {
    expect(esDiaPosterior(d('2026-09-11'), d('2026-09-10'))).toBe(true);
  });

  it('un día antes no venció', () => {
    expect(esDiaPosterior(d('2026-09-09'), d('2026-09-10'))).toBe(false);
  });

  it('la hora no cuenta: mismo día son el mismo día', () => {
    const temprano = new Date('2026-09-10T00:30:00.000Z');
    const tarde = new Date('2026-09-10T23:30:00.000Z');
    expect(esDiaPosterior(tarde, temprano)).toBe(false);
    expect(esDiaPosterior(temprano, tarde)).toBe(false);
  });

  const fronteras: [string, string, string][] = [
    ['de agosto a septiembre', '2026-09-01', '2026-08-31'],
    ['de febrero a marzo', '2026-03-01', '2026-02-28'],
    ['de diciembre a enero', '2027-01-01', '2026-12-31'],
  ];

  for (const [nombre, siguiente, anterior] of fronteras) {
    it(`el cruce ${nombre} es un día como cualquier otro`, () => {
      expect(esDiaPosterior(d(siguiente), d(anterior))).toBe(true);
      expect(esDiaPosterior(d(anterior), d(siguiente))).toBe(false);
    });
  }
});

describe('esDiaPosteriorOIgual', () => {
  it('el día del vencimiento cuenta como vigente', () => {
    expect(esDiaPosteriorOIgual(d('2026-09-10'), d('2026-09-10'))).toBe(true);
  });

  it('el día siguiente ya no', () => {
    expect(esDiaPosteriorOIgual(d('2026-09-09'), d('2026-09-10'))).toBe(false);
  });
});

// La razón de ser del módulo: la resta que rompía es imposible de pedir. Si algún día
// alguien exporta el entero empaquetado, esta prueba falla y explica por qué no debe.
//
// ── POR QUÉ CAMBIÓ EL MECANISMO, Y POR QUÉ NO SE AFLOJÓ ─────────────────────────────────
//
// Decía «todo export, llamado con dos fechas, devuelve un booleano». Eso alcanzaba mientras
// el módulo tuviera sólo las dos comparaciones, pero confundía **la garantía** —que nada
// restable salga de acá— con **una forma de comprobarla** que sólo servía para esa firma.
// `dia` no compara: convierte una cadena en una fecha, así que llamarla con dos `Date`
// revienta, y la prueba se ponía roja sin que nada de lo que protege hubiera pasado.
//
// Se generaliza a lo que siempre quiso decir: **ningún export produce un número.** Eso es
// MÁS fuerte que el booleano, no menos: un `number` es lo único que se puede restar, y ahora
// se prohíbe explícitamente en vez de prohibirse de rebote. La lista blanca se conserva:
// agregar un export sigue exigiendo tocar esta prueba, que es lo que obliga a pensarlo.
describe('la superficie del módulo', () => {
  it('no exporta nada que se pueda restar', async () => {
    const fechas = await import('../fechas');
    expect(Object.keys(fechas).sort()).toEqual(['dia', 'esDiaPosterior', 'esDiaPosteriorOIgual']);
    for (const valor of Object.values(fechas)) expect(typeof valor).toBe('function');

    const producidos: unknown[] = [
      fechas.esDiaPosterior(d('2026-09-11'), d('2026-09-10')),
      fechas.esDiaPosteriorOIgual(d('2026-09-11'), d('2026-09-10')),
      fechas.dia('2026-09-11'),
      fechas.dia('no-es-fecha'),
    ];
    for (const v of producidos) expect(typeof v).not.toBe('number');

    // Y las comparaciones siguen devolviendo booleanos, que es lo que la versión anterior
    // sostenía y no hay motivo para dejar de sostener.
    expect(typeof fechas.esDiaPosterior(d('2026-09-11'), d('2026-09-10'))).toBe('boolean');
    expect(typeof fechas.esDiaPosteriorOIgual(d('2026-09-11'), d('2026-09-10'))).toBe('boolean');
  });
});

// ── `dia`, y por qué vive acá ──────────────────────────────────────────────────────────
//
// Era una función privada de `app/sig/acciones/personas-edicion.ts`, y el alta de
// colaborador —`app/sig/acciones/colaborador-alta.ts`— hacía la misma conversión SIN su
// guarda: `new Date(\`${fecha}T00:00:00.000Z\`)` a secas. Dos piezas haciendo lo mismo desde
// orígenes distintos, que es la forma de defecto que este repositorio ya tiene medida cuatro
// veces — y es literalmente lo que cuenta el encabezado de este módulo sobre `diaDe`.
//
// No se alcanzaba por la pantalla: un `<input type="date">` acota lo que la persona teclea.
// Se alcanza por el servidor, y eso basta: `colaborador-alta.ts` abre con `'use server'`, así
// que cada export es un punto de entrada invocable desde el navegador con la carga que sea.
describe('dia', () => {
  it('convierte una fecha en el día UTC, sin hora', () => {
    expect(dia('2026-09-21')?.toISOString()).toBe('2026-09-21T00:00:00.000Z');
  });

  it('acepta un ISO completo y se queda con el día', () => {
    expect(dia('2026-09-21T18:45:00.000Z')?.toISOString()).toBe('2026-09-21T00:00:00.000Z');
  });

  it('sin valor no hay fecha', () => {
    expect(dia(null)).toBeNull();
    expect(dia(undefined)).toBeNull();
    expect(dia('')).toBeNull();
    expect(dia('   ')).toBeNull();
  });

  // El camino que el alta no cubría. Lo que importa es que devuelva `null` en vez de un
  // `Invalid Date`: un `Invalid Date` llega hasta Prisma y revienta ahí, y quien lo mandó ve
  // un error de plataforma en lugar de un mensaje que diga qué pasó.
  it('una cadena que no es fecha devuelve null, no un Invalid Date', () => {
    expect(dia('no-es-fecha')).toBeNull();
    expect(dia('2026-13-45')).toBeNull();
    expect(dia('ayer')).toBeNull();
  });

  // **El rango, y por qué no se queda quieto.** `fechaIngreso` alimenta `areaDesde` y
  // `cargoDesde` en el cálculo de la edición, así que un ingreso en 2062 se propaga a otras
  // columnas. Los dos errores que esto ataca son de tecleo: la cifra transpuesta —2062 por
  // 2026— y el año corrido —0202—.
  //
  // El techo es el año en curso más cinco, y no «hoy»: registrar a alguien que empieza el mes
  // que viene es normal, y un contrato firmado con un año de anticipación también.
  it('un año imposible se rechaza como si no fuera una fecha', () => {
    const hoy = new Date('2026-09-21T00:00:00.000Z');
    expect(dia('2062-09-21', hoy)).toBeNull();
    expect(dia('0202-09-21', hoy)).toBeNull();
    expect(dia('9999-01-01', hoy)).toBeNull();
    expect(dia('1899-12-31', hoy)).toBeNull();
  });

  it('el borde del rango se acepta, que es lo que lo hace un rango y no un capricho', () => {
    const hoy = new Date('2026-09-21T00:00:00.000Z');
    expect(dia('1900-01-01', hoy)).not.toBeNull();
    expect(dia('2031-12-31', hoy)).not.toBeNull();
    expect(dia('2032-01-01', hoy)).toBeNull();
  });

  // Un ingreso el mes que viene es lo más común del alta: se registra a quien ya firmó y
  // todavía no empezó.
  it('una fecha futura cercana es legítima', () => {
    const hoy = new Date('2026-09-21T00:00:00.000Z');
    expect(dia('2026-10-01', hoy)?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });
});
