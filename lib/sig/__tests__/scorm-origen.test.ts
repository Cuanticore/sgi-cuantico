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

  // `worker-src` no estaba declarada y caia a `default-src 'none'`: un curso que use un Web
  // Worker —empaquetadores modernos los generan solos para video y para SCORM offline— moria
  // sin decir nada util. Un worker corre con el origen del documento que lo crea, asi que
  // permitir `'self'` y `blob:` no le abre nada a nadie mas.
  it('declara worker-src en vez de dejarla caer a none', () => {
    expect(cspDelPaquete([])).toContain("worker-src 'self' blob:");
  });

  // `form-action 'none'` se queda como esta y es deliberado: un curso no tiene que enviar
  // formularios a ningun lado, y si alguno lo necesitara habria que verlo y decidirlo, no
  // permitirlo de entrada.
  it('sigue sin permitir el envio de formularios', () => {
    expect(cspDelPaquete(['https://my.coursebox.ai'])).toContain("form-action 'none'");
  });

  // El paquete puede declarar el mismo dominio dos veces —el HTML y su driver—, y una CSP
  // con el origen repetido es valida pero ilegible cuando alguien la lee para depurar.
  it('no repite un dominio', () => {
    const csp = cspDelPaquete(['https://a.com', 'https://a.com']);
    expect(csp.match(/https:\/\/a\.com/g)?.length).toBe(
      csp.split(';').filter((d) => d.includes('https://a.com')).length,
    );
  });
});
