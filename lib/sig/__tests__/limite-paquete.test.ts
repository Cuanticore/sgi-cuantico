// lib/sig/__tests__/limite-paquete.test.ts
//
// DOS NÚMEROS QUE NO SE PUEDEN SEPARAR, Y LO QUE PASÓ CUANDO SE SEPARARON.
//
// El techo de un paquete SCORM vive en dos sitios que no se pueden compartir: el límite del
// cuerpo de una Server Action se fija en `next.config.js` —CommonJS, leído al construir— y el
// que valida la acción es TypeScript de tiempo de ejecución. No hay un módulo que los dos
// puedan importar sin inventar un puente entre CJS y TS.
//
// El 21/09/2026 estaban separados y nadie lo sabía: `.env` declaraba 200 MB, la acción
// validaba contra 200 MB, y el techo que regía de verdad era **1 MB**, el valor por omisión
// de Next porque `next.config.js` no configuraba `serverActions`. La validación de la acción
// era código muerto para cualquier cosa sobre un megabyte: **la petición nunca llegaba**. Se
// descubrió subiendo un curso de 3,3 MB, no con los cuatro checks — ninguno ejecuta una
// subida.
//
// Esta prueba es la misma medicina que `despliegue-verificado.test.ts`: no verifica que el
// número sea el correcto, verifica que **los dos sigan diciendo lo mismo**. Separarlos se
// pone rojo.

import { join } from 'path';
import { MAX_PAQUETE_MB, techoEfectivoMb } from '../limite-paquete';

/// `next.config.js` es CommonJS y se lee tal como lo lee Next.
function configDeNext(): {
  experimental?: { serverActions?: { bodySizeLimit?: string | number } };
} {
  return require(join(__dirname, '..', '..', '..', 'next.config.js'));
}

/// `'26mb'` → 26. El formato lo define `bytes`, y acá sólo se usan megabytes.
function enMb(valor: string | number | undefined): number | null {
  if (valor === undefined) return null;
  if (typeof valor === 'number') return valor / (1024 * 1024);
  const m = /^(\d+(?:\.\d+)?)\s*mb$/i.exec(valor.trim());
  return m === null ? null : Number(m[1]);
}

describe('el techo del cuerpo y el techo del paquete no se pueden separar', () => {
  it('next.config.js configura un límite de cuerpo para las Server Actions', () => {
    // Sin esta clave rige el 1 MB por omisión de Next, y NINGÚN paquete real se puede subir.
    // El defecto no lo atrapa ningún otro check: no hay test que ejecute una subida.
    const limite = configDeNext().experimental?.serverActions?.bodySizeLimit;
    expect(limite).toBeDefined();
    expect(enMb(limite)).not.toBeNull();
  });

  // La holgura no es un margen por las dudas. La documentación de Next 16.3.2 dice que el
  // límite se aplica al cuerpo HTTP CRUDO, «including the bytes that multipart/form-data adds
  // for boundaries, part headers, and field metadata», y recomienda 10–20 KB de sobra. Un
  // megabyte cubre eso con creces y no cuesta nada.
  it('el límite del cuerpo deja pasar un paquete del tamaño máximo, con su sobre', () => {
    const cuerpoMb = enMb(configDeNext().experimental?.serverActions?.bodySizeLimit);
    expect(cuerpoMb).not.toBeNull();
    expect(cuerpoMb as number).toBeGreaterThanOrEqual(MAX_PAQUETE_MB + 1);
  });
});

describe('techoEfectivoMb · la variable de entorno puede BAJAR el techo, nunca subirlo', () => {
  // El límite del cuerpo se fija al construir la imagen; una variable de entorno se lee al
  // arrancarla. Dejar que la variable lo suba sería volver al defecto de arriba con otra
  // forma: la acción aceptaría 200 MB y Next seguiría cortando en 26.
  it('un valor por encima del máximo se recorta al máximo', () => {
    expect(techoEfectivoMb('200')).toBe(MAX_PAQUETE_MB);
  });

  it('un valor por debajo se respeta', () => {
    expect(techoEfectivoMb('5')).toBe(5);
  });

  it('sin variable, el máximo', () => {
    expect(techoEfectivoMb(undefined)).toBe(MAX_PAQUETE_MB);
    expect(techoEfectivoMb('')).toBe(MAX_PAQUETE_MB);
  });

  // Un valor mal escrito NO se interpreta como cero: un techo de cero rechazaría todo
  // paquete con un mensaje sobre tamaños, y mandaría a buscar el problema en el archivo.
  it('un valor inválido cae al máximo, no a cero', () => {
    expect(techoEfectivoMb('muchos')).toBe(MAX_PAQUETE_MB);
    expect(techoEfectivoMb('0')).toBe(MAX_PAQUETE_MB);
    expect(techoEfectivoMb('-5')).toBe(MAX_PAQUETE_MB);
  });
});
