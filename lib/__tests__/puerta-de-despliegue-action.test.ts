/**
 * @jest-environment node
 */

// lib/__tests__/puerta-de-despliegue-action.test.ts
//
// **La automatización que se instala en cada repositorio, probada acá.**
//
// `.github/actions/puerta-de-despliegue/puerta.js` es el único archivo que la action ejecuta.
// No tiene dependencias y no puede tenerlas: corre en repositorios que no tienen este código
// ni este `node_modules` — repos de WordPress, de Python, de lo que sea.
//
// Y justamente porque va a vivir lejos, se prueba acá. Un archivo suelto en `.github/actions/`
// es exactamente la clase de cosa que nadie mira hasta el día que detiene un despliegue por el
// motivo equivocado.
//
// LO QUE ESTE ARCHIVO **NO** DECIDE. No sabe qué hace falta para desplegar. Lee el vínculo,
// pregunta al SGI y traduce la respuesta a una salida que una persona pueda leer con el
// despliegue detenido. La norma vive en `lib/sig/puerta-de-despliegue.ts`, en un solo sitio,
// porque un producto puede tener varios repositorios y cuatro copias de la regla son cuatro
// respuestas distintas el día que el procedimiento cambie.
//
// SE PRUEBA EL ARCHIVO REAL, no una copia. Si alguien lo edita y rompe el formato del vínculo,
// esta suite se pone roja en este repositorio aunque el daño se fuera a manifestar en otro.

import { leerVinculo, resumen } from '../../.github/actions/puerta-de-despliegue/puerta';

describe('leer el vínculo entre el repositorio y el sistema', () => {
  it('lee el sistema y el componente', () => {
    expect(
      leerVinculo(['# a qué sistema del SGI pertenece este repo', 'sistema: SIS-001', 'componente: backend-api'].join('\n')),
    ).toEqual({ sistema: 'SIS-001', componente: 'backend-api' });
  });

  it('tolera comentarios, líneas en blanco y espacios de más', () => {
    expect(leerVinculo('\n\n  sistema:   SIS-014  \n# comentario\ncomponente: web\n')).toEqual({
      sistema: 'SIS-014',
      componente: 'web',
    });
  });

  it('acepta valores entrecomillados, que es como los escribe mucha gente', () => {
    expect(leerVinculo('sistema: "SIS-001"\ncomponente: \'backend-api\'')).toEqual({
      sistema: 'SIS-001',
      componente: 'backend-api',
    });
  });

  it('exige el sistema, y lo dice con el nombre del archivo', () => {
    // Quien lee este error está mirando un despliegue detenido en un repositorio ajeno. El
    // mensaje tiene que decirle qué archivo abrir, no «undefined».
    expect(() => leerVinculo('componente: web')).toThrow(/sistema/);
    expect(() => leerVinculo('componente: web')).toThrow(/\.sgi\/sistema\.yml/);
  });

  it('exige el componente: es lo que distingue a los cuatro repos de un mismo producto', () => {
    expect(() => leerVinculo('sistema: SIS-001')).toThrow(/componente/);
  });

  it('rechaza un código de sistema que no tiene la forma SIS-NNN', () => {
    // Un código mal escrito produciría un 404 del SGI, y el mensaje hablaría de un sistema
    // inexistente en vez del error de dedo que de verdad pasó.
    expect(() => leerVinculo('sistema: mintrace\ncomponente: web')).toThrow(/SIS-/);
  });

  it('**rechaza estructuras anidadas en vez de adivinar**', () => {
    // El parser entiende `clave: valor` y nada más. Un YAML con listas o mapas anidados es
    // válido para YAML e incomprensible para él, y adivinar sería peor que fallar: la puerta
    // consultaría por un sistema equivocado y respondería que sí con total seguridad.
    expect(() => leerVinculo('sistema:\n  - SIS-001\ncomponente: web')).toThrow();
  });
});

describe('el resumen que se escribe en el despliegue', () => {
  const bloqueada = {
    sistema: 'SIS-001',
    nombre: 'MinTrace Trazabilidad',
    version: 'v2.4.0',
    puedeDesplegar: false,
    faltantes: [
      'La puerta P5 (autorización de paso a producción) está sin registrar.',
      'No hay ninguna liberación registrada para la versión «v2.4.0».',
    ],
    avisos: ['Sin registrar: P2, P3.'],
  };

  it('nombra el sistema y la versión: quien lo lee puede estar viendo varios despliegues', () => {
    const texto = resumen(bloqueada, 'https://sig.cuantico.com');

    expect(texto).toContain('SIS-001');
    expect(texto).toContain('v2.4.0');
  });

  it('lista TODOS los faltantes, no el primero', () => {
    // Resolverlos de a uno obliga a un ciclo de despliegue fallido por cada condición. El
    // expediente SIS-001 tenía 19 hallazgos: nadie quiere enterarse de a uno.
    const texto = resumen(bloqueada, 'https://sig.cuantico.com');

    for (const f of bloqueada.faltantes) expect(texto).toContain(f);
  });

  it('separa los avisos de los faltantes: unos detienen y otros no', () => {
    const texto = resumen(bloqueada, 'https://sig.cuantico.com');
    const posicionFaltantes = texto.indexOf(bloqueada.faltantes[0]);
    const posicionAvisos = texto.indexOf(bloqueada.avisos[0]);

    expect(posicionFaltantes).toBeGreaterThanOrEqual(0);
    expect(posicionAvisos).toBeGreaterThan(posicionFaltantes);
  });

  it('enlaza a la pantalla donde se arregla', () => {
    // Un mensaje que dice qué falta y no dónde arreglarlo deja a quien lo lee buscando la URL
    // con el despliegue detenido, que es el peor momento para buscar nada.
    expect(resumen(bloqueada, 'https://sig.cuantico.com')).toContain(
      'https://sig.cuantico.com/tecnologia/sistemas',
    );
  });

  it('cuando se puede desplegar, lo dice y no inventa faltantes', () => {
    const texto = resumen(
      { ...bloqueada, puedeDesplegar: true, faltantes: [], avisos: [] },
      'https://sig.cuantico.com',
    );

    expect(texto).toMatch(/autoriza|puede desplegar/i);
    expect(texto).not.toMatch(/falta/i);
  });

  it('un despliegue autorizado con avisos los muestra igual', () => {
    // Que no detengan no significa que no importen: una hoja de vida con puertas en blanco es
    // la que el expediente SIS-001 tuvo el día de su auditoría.
    const texto = resumen(
      { ...bloqueada, puedeDesplegar: true, faltantes: [], avisos: ['Sin registrar: P2, P3.'] },
      'https://sig.cuantico.com',
    );

    expect(texto).toContain('P2, P3');
  });
});
