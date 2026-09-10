// lib/sig/__tests__/scorm-origen.test.ts
//
// P3 · el aislamiento por origen y la CSP por paquete (D-5). Se prueba acá porque las dos
// reglas las usan tres lugares —la ruta de archivos, el runner y la página del player— y
// una tercera implementación de «¿este host es el del contenido?» es la que va a fallar
// abierta el día que alguien la escriba de memoria.

import { cspDelPaquete, esOrigenDeContenido, hostDe } from '../scorm-origen';

describe('esOrigenDeContenido', () => {
  it('acepta el host configurado', () => {
    expect(esOrigenDeContenido('cursos.sig.cuantico.com', 'https://cursos.sig.cuantico.com')).toBe(true);
  });

  it('rechaza el host de la aplicación', () => {
    expect(esOrigenDeContenido('sig.cuantico.com', 'https://cursos.sig.cuantico.com')).toBe(false);
  });

  // Sin origen aislado el player NO corre. Correrlo en el origen de la aplicación le daría
  // al JavaScript del curso la sesión de quien lo está viendo.
  it('sin variable configurada no habilita nada', () => {
    expect(esOrigenDeContenido('cursos.sig.cuantico.com', undefined)).toBe(false);
    expect(esOrigenDeContenido('cursos.sig.cuantico.com', '')).toBe(false);
  });

  it('hostDe tolera basura', () => {
    expect(hostDe('no-es-una-url')).toBeNull();
  });
});

describe('cspDelPaquete', () => {
  it('un autocontenido no permite ningún dominio externo', () => {
    const csp = cspDelPaquete([]);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/https?:\/\//);
  });

  it('un despacho permite exactamente los suyos', () => {
    const csp = cspDelPaquete(['https://my.coursebox.ai']);
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval' https://my.coursebox.ai");
    expect(csp).toContain('frame-src \'self\' https://my.coursebox.ai');
  });
});
