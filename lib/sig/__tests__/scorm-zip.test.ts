// lib/sig/__tests__/scorm-zip.test.ts
//
// P6 · descomprimir es un camino hostil. El .zip lo sube una persona, y un paquete puede
// traer `../../etc/passwd` en un nombre de archivo, 40 000 entradas, o 10 GB comprimidos en
// 2 MB. Estas reglas se prueban acá para que el módulo que descomprime no tenga que
// decidir nada: sólo obedecer.

import {
  LIMITE_ARCHIVOS,
  excedeElTotal,
  limiteDescomprimido,
  rutaSegura,
} from '../scorm-zip';

describe('rutaSegura', () => {
  it('acepta una ruta relativa normal', () => {
    expect(rutaSegura('shared/launchpage.html')).toBe('shared/launchpage.html');
  });

  it('normaliza las barras invertidas de Windows', () => {
    expect(rutaSegura('shared\\js\\app.js')).toBe('shared/js/app.js');
  });

  it('quita el ./ inicial', () => {
    expect(rutaSegura('./imsmanifest.xml')).toBe('imsmanifest.xml');
  });

  // Zip slip: la entrada escapa del directorio del paquete.
  it('rechaza el escape con ..', () => {
    expect(rutaSegura('../../etc/passwd')).toBeNull();
    expect(rutaSegura('a/../../b')).toBeNull();
  });

  it('rechaza una ruta absoluta', () => {
    expect(rutaSegura('/etc/passwd')).toBeNull();
    expect(rutaSegura('C:/Windows/system32')).toBeNull();
  });

  it('rechaza los bytes nulos', () => {
    expect(rutaSegura('a\u0000b.html')).toBeNull();
  });

  it('rechaza una ruta vacía', () => {
    expect(rutaSegura('')).toBeNull();
    expect(rutaSegura('   ')).toBeNull();
  });
});

describe('límites', () => {
  it('el techo descomprimido es cuatro veces el del zip', () => {
    expect(limiteDescomprimido(200)).toBe(200 * 1024 * 1024 * 4);
  });

  it('el conteo de archivos tiene techo', () => {
    expect(LIMITE_ARCHIVOS).toBe(2000);
  });

  // Bomba zip: 2 MB comprimidos que se expanden a 10 GB.
  it('detecta la expansión desmedida', () => {
    expect(excedeElTotal(10 * 1024 ** 3, limiteDescomprimido(200))).toBe(true);
    expect(excedeElTotal(50 * 1024 ** 2, limiteDescomprimido(200))).toBe(false);
  });
});
