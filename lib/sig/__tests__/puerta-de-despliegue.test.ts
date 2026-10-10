/**
 * @jest-environment node
 */

// lib/sig/__tests__/puerta-de-despliegue.test.ts
//
// **¿Este sistema puede desplegar ESTA versión a producción?**
//
// La regla vive acá y no en la automatización de cada repositorio, y es la decisión de
// arquitectura que sostiene todo lo demás: un producto como MinTrace tiene varios
// repositorios, y si cada uno llevara su copia de la regla, «una regla implementada en dos
// módulos es una regla que se puede corregir a medias». Cuatro copias, cuatro respuestas.
//
// El repositorio pregunta; el SGI responde. La action que se instala en cada repo son quince
// líneas de `curl` sin ninguna dependencia, y no puede desviarse de la norma porque no la
// conoce.
//
// DE DÓNDE SALE CADA REGLA:
//
//   - `PRO-TEC-04` §5.3 · un sistema **sin hoja de vida abierta** no puede desplegarse en
//     productivo. Es la condición 1, y es la que el precedente SIS-001 convirtió en norma:
//     la hoja se abrió 16 meses después del primer commit, con el sistema ya en producción.
//
//   - `PRO-PRO-03` §5.2 · una puerta **sin registro se considera no superada**. Por eso P5
//     ausente bloquea igual que P5 en `NO_SUPERADA`: no hay diferencia entre «no se evaluó» y
//     «no pasó», y tratarlas distinto premia al que no registra.
//
//   - Los **23 despliegues sin autorización ni plan de reversión** que el expediente SIS-001
//     dejó documentados. Eso, en este esquema, es `Liberacion.autoriza` en null y
//     `planReversion` en false. Las condiciones 4, 5 y 6 existen por esos 23.
//
// LO QUE ESTA PUERTA **NO** HACE, Y ES A PROPÓSITO: no exige P1 a P4.
//
// `Sistema` lo dice en el schema con todas las letras (D17): «las puertas **no bloquean el
// avance**. Se registran, se cuentan y salen en el tablero; el control vive en PRO-TEC-04 y en
// la gerencia de proyectos. Una herramienta que bloquea sin conocer el contexto termina
// obligando a mentirle.»
//
// P5 es distinta y por eso sí bloquea: no es una puerta de avance de fase, es literalmente
// «Autorización de paso a producción». Bloquear el paso a producción es lo único que hace.
// Las otras se informan —salen en `avisos`— para que se vean, no para detener a nadie.

import { puertaDeDespliegue } from '../puerta-de-despliegue';

/// Una hoja de vida en regla, de la que cada caso quita exactamente una cosa.
function hojaEnRegla() {
  return {
    codigo: 'SIS-001',
    nombre: 'MinTrace Trazabilidad',
    abiertaEn: '2026-01-15T10:00:00.000Z',
    cerradaEn: null,
    puertas: [
      { puerta: 'P1', resultado: 'SUPERADA' },
      { puerta: 'P5', resultado: 'SUPERADA' },
    ],
    liberaciones: [
      { version: 'v2.4.0', autoriza: 'Ana Pérez', planReversion: true, resultado: null },
    ],
  };
}

describe('una hoja de vida en regla deja desplegar', () => {
  const r = puertaDeDespliegue(hojaEnRegla(), 'v2.4.0');

  it('autoriza', () => {
    expect(r.puedeDesplegar).toBe(true);
  });

  it('no reporta faltantes', () => {
    expect(r.faltantes).toEqual([]);
  });
});

describe('PRO-TEC-04 §5.3 · sin hoja de vida abierta no se despliega', () => {
  it('una hoja sin abrir bloquea, y lo dice con el procedimiento que lo exige', () => {
    const r = puertaDeDespliegue({ ...hojaEnRegla(), abiertaEn: null }, 'v2.4.0');

    expect(r.puedeDesplegar).toBe(false);
    expect(r.faltantes.join(' ')).toContain('PRO-TEC-04');
  });

  it('una hoja CERRADA bloquea: el sistema se retiró, y desplegarle es un hallazgo', () => {
    // P6 cierra la hoja de vida. Un despliegue después de eso significa que el retiro no fue
    // real, o que alguien está publicando sobre un sistema que la organización dio de baja.
    const r = puertaDeDespliegue(
      { ...hojaEnRegla(), cerradaEn: '2026-09-01T00:00:00.000Z' },
      'v2.4.0',
    );

    expect(r.puedeDesplegar).toBe(false);
    expect(r.faltantes.join(' ')).toMatch(/cerrada|retir/i);
  });
});

describe('PRO-PRO-03 §5.2 · una puerta sin registro se considera no superada', () => {
  it('P5 ausente bloquea', () => {
    const hoja = hojaEnRegla();
    const r = puertaDeDespliegue(
      { ...hoja, puertas: hoja.puertas.filter((p) => p.puerta !== 'P5') },
      'v2.4.0',
    );

    expect(r.puedeDesplegar).toBe(false);
    expect(r.faltantes.join(' ')).toContain('P5');
  });

  it.each(['PENDIENTE', 'NO_SUPERADA'])('P5 en %s bloquea', (resultado) => {
    const hoja = hojaEnRegla();
    const r = puertaDeDespliegue(
      { ...hoja, puertas: [{ puerta: 'P5', resultado }] },
      'v2.4.0',
    );

    expect(r.puedeDesplegar).toBe(false);
  });

  it('P5 ausente y P5 en NO_SUPERADA dicen lo mismo', () => {
    // No hay diferencia entre «no se evaluó» y «no pasó»: tratarlas distinto premia a quien
    // no registra, que es exactamente la conducta que el procedimiento quiere desalentar.
    const hoja = hojaEnRegla();
    const ausente = puertaDeDespliegue({ ...hoja, puertas: [] }, 'v2.4.0');
    const fallida = puertaDeDespliegue(
      { ...hoja, puertas: [{ puerta: 'P5', resultado: 'NO_SUPERADA' }] },
      'v2.4.0',
    );

    expect(ausente.puedeDesplegar).toBe(fallida.puedeDesplegar);
  });

  it('P5 SUPERADA_CON_EXCEPCION sí deja desplegar: la excepción es una decisión tomada', () => {
    // Una excepción de seguridad tiene justificación, evaluación de riesgo, quién la aprobó y
    // fecha de cierre obligatoria. Es lo contrario de un hueco: es un riesgo aceptado con
    // nombre y plazo. Bloquearla obligaría a no registrarla.
    const hoja = hojaEnRegla();
    const r = puertaDeDespliegue(
      { ...hoja, puertas: [{ puerta: 'P5', resultado: 'SUPERADA_CON_EXCEPCION' }] },
      'v2.4.0',
    );

    expect(r.puedeDesplegar).toBe(true);
  });
});

describe('los 23 despliegues de SIS-001 · la liberación de ESTA versión', () => {
  it('sin liberación para la versión, bloquea nombrando la versión', () => {
    const r = puertaDeDespliegue(hojaEnRegla(), 'v2.5.0');

    expect(r.puedeDesplegar).toBe(false);
    expect(r.faltantes.join(' ')).toContain('v2.5.0');
  });

  it('una liberación SIN autorizador bloquea', () => {
    // Es, literal, uno de los 19 hallazgos críticos del expediente SIS-001.
    const hoja = hojaEnRegla();
    const r = puertaDeDespliegue(
      { ...hoja, liberaciones: [{ ...hoja.liberaciones[0], autoriza: null }] },
      'v2.4.0',
    );

    expect(r.puedeDesplegar).toBe(false);
    expect(r.faltantes.join(' ')).toMatch(/autoriza/i);
  });

  it('una liberación SIN plan de reversión bloquea', () => {
    const hoja = hojaEnRegla();
    const r = puertaDeDespliegue(
      { ...hoja, liberaciones: [{ ...hoja.liberaciones[0], planReversion: false }] },
      'v2.4.0',
    );

    expect(r.puedeDesplegar).toBe(false);
    expect(r.faltantes.join(' ')).toMatch(/revers/i);
  });

  it('la versión se compara exacta, no por prefijo', () => {
    // `v2.4` no autoriza `v2.4.0`. Un prefijo dejaría que una autorización vieja cubriera un
    // despliegue que nadie miró, que es la forma elegante de volver a los 23.
    const hoja = hojaEnRegla();
    const r = puertaDeDespliegue(
      { ...hoja, liberaciones: [{ ...hoja.liberaciones[0], version: 'v2.4' }] },
      'v2.4.0',
    );

    expect(r.puedeDesplegar).toBe(false);
  });
});

describe('D17 · las puertas de avance se informan, no bloquean', () => {
  it('P1 a P4 sin registrar NO impiden desplegar, pero salen como aviso', () => {
    // El schema lo dice: «una herramienta que bloquea sin conocer el contexto termina
    // obligando a mentirle». Lo que sí bloquea es P5, que no es una puerta de avance de fase
    // sino literalmente la autorización de paso a producción.
    const hoja = hojaEnRegla();
    const r = puertaDeDespliegue(
      { ...hoja, puertas: [{ puerta: 'P5', resultado: 'SUPERADA' }] },
      'v2.4.0',
    );

    expect(r.puedeDesplegar).toBe(true);
    expect(r.avisos.join(' ')).toMatch(/P1|P2|P3|P4/);
  });

  it('con todas las puertas registradas no hay avisos', () => {
    const r = puertaDeDespliegue(
      {
        ...hojaEnRegla(),
        puertas: ['P1', 'P2', 'P3', 'P4', 'P5'].map((puerta) => ({
          puerta,
          resultado: 'SUPERADA',
        })),
      },
      'v2.4.0',
    );

    expect(r.avisos).toEqual([]);
  });
});

describe('cada faltante dice QUIÉN lo cierra', () => {
  it('no basta con decir qué falta', () => {
    // Un mensaje que dice «falta P5» deja a quien lo lee buscando a quién preguntarle. El
    // despliegue está detenido en ese momento: es cuando menos tiempo hay para averiguarlo.
    const r = puertaDeDespliegue({ ...hojaEnRegla(), puertas: [] }, 'v9.9.9');

    expect(r.faltantes.length).toBeGreaterThan(0);
    for (const f of r.faltantes) {
      expect(f.length).toBeGreaterThan(40);
    }
  });
});
