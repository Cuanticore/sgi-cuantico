// lib/sig/puerta-de-despliegue.ts
//
// **¿Este sistema puede desplegar ESTA versión a producción?**
//
// LA DECISIÓN DE ARQUITECTURA QUE SOSTIENE TODO LO DEMÁS: la regla vive acá, en el SGI, y no
// en la automatización de cada repositorio.
//
// Un producto como MinTrace tiene varios repositorios. Si cada uno llevara su copia de la
// regla, serían cuatro copias y, el día que el procedimiento cambie, cuatro respuestas
// distintas durante un tiempo que nadie puede medir. «Una regla implementada en dos módulos es
// una regla que se puede corregir a medias.»
//
// Así que el repositorio **pregunta** y el SGI **responde**. La automatización que se instala en
// cada repo son quince líneas de `curl` sin ninguna dependencia, y no puede desviarse de la
// norma por la mejor de las razones: no la conoce.
//
// DE DÓNDE SALE CADA REGLA:
//
//   - `PRO-TEC-04` §5.3 · un sistema **sin hoja de vida abierta** no puede desplegarse en
//     productivo. Es la norma que el precedente SIS-001 convirtió en regla dura: allí la hoja
//     se abrió **16 meses después del primer commit**, con el sistema ya en producción, y el
//     resultado fue 0 de 6 puertas superadas y 19 hallazgos críticos.
//
//   - `PRO-PRO-03` §5.2 · una puerta **sin registro se considera no superada**. Por eso P5
//     ausente bloquea igual que P5 en `NO_SUPERADA`: no hay diferencia real entre «no se
//     evaluó» y «no pasó», y tratarlas distinto premiaría a quien no registra.
//
//   - Los **23 despliegues sin autorización ni plan de reversión** que el expediente SIS-001
//     dejó documentados. En este esquema eso es, exactamente, `Liberacion.autoriza` en null y
//     `Liberacion.planReversion` en false.
//
// LO QUE ESTA PUERTA **NO** HACE, Y ES A PROPÓSITO: no exige P1 a P4.
//
// El schema lo dice con todas las letras en `PuertaSistema` (D17): «las puertas **no bloquean
// el avance**. Se registran, se cuentan y salen en el tablero; el control vive en PRO-TEC-04 y
// en la gerencia de proyectos. Una herramienta que bloquea sin conocer el contexto termina
// obligando a mentirle.»
//
// P5 es la excepción y por eso sí bloquea: no es una puerta de avance de fase, es literalmente
// «Autorización de paso a producción». Detener el paso a producción es lo único que hace.
// Las demás salen en `avisos` para que se vean, no para detener a nadie.

/// La parte de la hoja de vida que esta decisión necesita. Se declara así —y no con el tipo de
/// Prisma— porque la entrada real llega como JSON desde `hojaDeVidaCompleta`, y porque atar la
/// regla al cliente de la base impediría probarla sin una.
export interface HojaParaPuerta {
  codigo: string;
  nombre?: string;
  abiertaEn: string | null;
  cerradaEn: string | null;
  puertas: readonly { puerta: string; resultado: string }[];
  liberaciones: readonly {
    version: string;
    autoriza: string | null;
    planReversion: boolean;
    resultado?: string | null;
  }[];
}

export interface ResultadoDePuerta {
  puedeDesplegar: boolean;
  /// Lo que impide desplegar. Vacío significa que se puede.
  faltantes: string[];
  /// Lo que falta pero NO bloquea. Se informa para que se vea.
  avisos: string[];
}

/// Los resultados de puerta que cuentan como superada.
///
/// `SUPERADA_CON_EXCEPCION` entra, y no es una concesión: una `ExcepcionSeguridad` tiene
/// justificación, evaluación de riesgo, quién la aprobó y **fecha de cierre obligatoria**. Es
/// lo contrario de un hueco — es un riesgo aceptado, con nombre y con plazo. Bloquearla
/// empujaría a no registrarla, que es como se pierde el rastro.
const SUPERADAS = new Set(['SUPERADA', 'SUPERADA_CON_EXCEPCION']);

/// Las puertas de avance de fase. Se informan; no bloquean. Ver D17 arriba.
const PUERTAS_DE_AVANCE = ['P1', 'P2', 'P3', 'P4'] as const;

export function puertaDeDespliegue(hoja: HojaParaPuerta, version: string): ResultadoDePuerta {
  const faltantes: string[] = [];
  const avisos: string[] = [];

  // 1 · La hoja de vida existe y está abierta.
  if (hoja.abiertaEn === null) {
    faltantes.push(
      `La hoja de vida de «${hoja.codigo}» no está abierta, y PRO-TEC-04 §5.3 no permite ` +
        'desplegar en productivo un sistema sin ella. La abre el Propietario del sistema, ' +
        'en la pantalla de Tecnología › Sistemas.',
    );
  }

  // 2 · Y no está cerrada. P6 cierra la hoja de vida al retirar el sistema; desplegarle
  //     después significa que el retiro no fue real, o que se está publicando sobre algo que
  //     la organización dio de baja. Las dos cosas son hallazgos.
  if (hoja.cerradaEn !== null) {
    faltantes.push(
      `La hoja de vida de «${hoja.codigo}» está cerrada desde ${hoja.cerradaEn}: el sistema ` +
        'fue retirado con la puerta P6. Desplegar sobre un sistema retirado es un hallazgo; ' +
        'si el retiro fue un error, lo reabre el Propietario del sistema.',
    );
  }

  // 3 · P5 registrada y superada. Ausente cuenta como no superada (PRO-PRO-03 §5.2).
  const p5 = hoja.puertas.find((p) => p.puerta === 'P5');
  if (p5 === undefined || !SUPERADAS.has(p5.resultado)) {
    const estado = p5 === undefined ? 'sin registrar' : `en estado ${p5.resultado}`;
    faltantes.push(
      `La puerta P5 (autorización de paso a producción) está ${estado}. PRO-PRO-03 §5.2: una ` +
        'puerta sin registro se considera no superada. La registra el Responsable de ' +
        'Seguridad de la Información, y la autoriza quien el procedimiento designe — no ' +
        'pueden ser la misma persona.',
    );
  }

  // 4, 5 y 6 · La liberación de ESTA versión, con autorizador y plan de reversión.
  //
  // La comparación es exacta a propósito. Un prefijo dejaría que la autorización de `v2.4`
  // cubriera un `v2.4.0` que nadie miró, que es la forma elegante de volver a los 23
  // despliegues sin autorización del expediente SIS-001.
  const liberacion = hoja.liberaciones.find((l) => l.version === version);

  if (liberacion === undefined) {
    faltantes.push(
      `No hay ninguna liberación registrada para la versión «${version}» de «${hoja.codigo}». ` +
        'Cada paso a producción se registra con su versión, su autorizador y su plan de ' +
        'reversión. La registra el Responsable Técnico del sistema antes de desplegar.',
    );
  } else {
    if (liberacion.autoriza === null) {
      faltantes.push(
        `La liberación «${version}» no tiene quién la autorice. El expediente SIS-001 ` +
          'documentó 23 despliegues sin autorización ni plan de reversión: esta condición ' +
          'existe por esos 23. La autoriza el Propietario del sistema.',
      );
    }
    if (!liberacion.planReversion) {
      faltantes.push(
        `La liberación «${version}» no declara plan de reversión. Sin él, un despliegue que ` +
          'salga mal no tiene vuelta escrita y se improvisa con producción caída. Lo declara ' +
          'el Responsable Técnico al registrar la liberación.',
      );
    }
  }

  // Las de avance: se informan, no bloquean.
  const registradas = new Set(hoja.puertas.map((p) => p.puerta));
  const sinRegistrar = PUERTAS_DE_AVANCE.filter((p) => !registradas.has(p));
  if (sinRegistrar.length > 0) {
    avisos.push(
      `Sin registrar: ${sinRegistrar.join(', ')}. No bloquean el despliegue —las puertas de ` +
        'avance se registran y se cuentan, no detienen—, pero una hoja de vida con puertas ' +
        'en blanco es la que el expediente SIS-001 tuvo el día de su auditoría.',
    );
  }

  return { puedeDesplegar: faltantes.length === 0, faltantes, avisos };
}
