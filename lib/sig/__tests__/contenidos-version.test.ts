// lib/sig/__tests__/contenidos-version.test.ts
//
// D6 · el versionado de contenido, y que NO invalida.
//
// El defecto que esto cierra: `ContenidoSig.version` era solo un contador y
// `editarContenido` hacia `update` sobre el titulo y la descripcion, asi que el texto
// anterior se perdia. Con eso, `versionLeida = "1"` decia «lei la version 1» y nadie podia
// producir la version 1 — el acuse era verificable solo de nombre.
//
// Lo que se prueba aca es CUANDO nace una version, y sobre todo cuando NO: una version de
// mas es un acuse de lectura que se le pide a la gente sobre un documento identico, y eso
// entrena a firmar sin leer.

import { cambiaElTexto, versionAPublicar, versionTrasEditar, type TextoVersionado } from '../contenidos';

const ACTUAL: TextoVersionado & { version: number } = {
  version: 2,
  titulo: 'Política de seguridad de la información',
  descripcion: 'Los principios de gobierno del SGSI.',
  documentoCodigo: 'POL-SIG-02',
  documentoNombre: 'Política de Gobierno de la Seguridad',
  documentoVersion: '2',
  documentoUrl: 'https://sharepoint/pol-sig-02-v2.pdf',
};

describe('versionTrasEditar (R10)', () => {
  it('sube cuando el contenido ya genero obligaciones', () => {
    expect(versionTrasEditar(2, true)).toBe(3);
  });

  // Un contenido que nadie ha leido todavia se corrige, no se versiona. Subir la version
  // ahi solo produce un historial de versiones que nadie leyo.
  it('no sube cuando todavia no genero ninguna', () => {
    expect(versionTrasEditar(2, false)).toBe(2);
  });
});

describe('cambiaElTexto', () => {
  it('detecta un cambio en el titulo', () => {
    expect(cambiaElTexto(ACTUAL, { titulo: 'Política de seguridad' }, 'LECTURA')).toBe(true);
  });

  it('detecta un cambio en la referencia al documento', () => {
    // Un acuse contra «POL-SIG-02 v2» no dice nada si esa URL pasa a apuntar a la v3.
    expect(cambiaElTexto(ACTUAL, { documentoUrl: 'https://sharepoint/v3.pdf' }, 'LECTURA')).toBe(
      true,
    );
    expect(cambiaElTexto(ACTUAL, { documentoVersion: '3' }, 'LECTURA')).toBe(true);
  });

  // El caso que evita la version de mas: si solo cambio la modalidad o la duracion, el
  // texto que la persona leyo es el MISMO.
  it('un campo que no se lee no cuenta como cambio de texto', () => {
    expect(cambiaElTexto(ACTUAL, {}, 'LECTURA')).toBe(false);
  });

  // Guardar el formulario sin tocar nada manda todos los campos con su valor actual. Eso
  // no es un cambio, y tratarlo como tal versionaria en cada guardado.
  it('reenviar el mismo valor NO es un cambio', () => {
    expect(
      cambiaElTexto(ACTUAL, { titulo: ACTUAL.titulo, descripcion: ACTUAL.descripcion }, 'LECTURA'),
    ).toBe(false);
  });

  it('un campo de documento que pasa a nulo si cuenta', () => {
    expect(cambiaElTexto(ACTUAL, { documentoUrl: null }, 'LECTURA')).toBe(true);
  });
});

// REQ-SIG-26 · D-2 · en un CURSO_VIRTUAL, `documentoUrl` es DONDE esta el curso, no que
// dice. Corregir una URL rota no es publicar una version nueva del curso, y subir la
// version por eso le pide un acuse nuevo a gente que ya lo hizo.
//
// La distincion no es cosmetica: en una LECTURA la URL apunta al documento que se LEE, y
// cambiarla apunta a otro documento. Ahi versionar es correcto, y sigue igual.
describe('cambiaElTexto · CURSO_VIRTUAL (REQ-SIG-26 · D-2)', () => {
  const CURSO: TextoVersionado = {
    titulo: 'Inducción Corporativa Cuantico',
    descripcion: 'Curso de inducción para todo el personal.',
    documentoCodigo: null,
    documentoNombre: 'Coursebox',
    documentoVersion: null,
    documentoUrl: 'https://my.coursebox.ai/curso/induccion',
  };

  it('corregir el enlace del curso NO sube la version', () => {
    expect(
      cambiaElTexto(
        CURSO,
        { documentoUrl: 'https://my.coursebox.ai/c/induccion-2026' },
        'CURSO_VIRTUAL',
      ),
    ).toBe(false);
  });

  it('cambiar la plataforma tampoco', () => {
    expect(cambiaElTexto(CURSO, { documentoNombre: 'Otra plataforma' }, 'CURSO_VIRTUAL')).toBe(
      false,
    );
  });

  it('cambiar el titulo SI sube la version', () => {
    expect(cambiaElTexto(CURSO, { titulo: 'Inducción Corporativa 2027' }, 'CURSO_VIRTUAL')).toBe(
      true,
    );
  });

  it('cambiar la descripcion SI sube la version', () => {
    expect(cambiaElTexto(CURSO, { descripcion: 'Otro alcance' }, 'CURSO_VIRTUAL')).toBe(true);
  });

  // El mismo cambio, sobre el mismo campo, con otro tipo: en una LECTURA sigue contando.
  it('en una LECTURA el enlace sigue contando', () => {
    expect(cambiaElTexto(ACTUAL, { documentoUrl: 'https://sharepoint/v3.pdf' }, 'LECTURA')).toBe(
      true,
    );
  });
});

// REQ-SIG-26 · D-2 · en un CURSO_VIRTUAL, `documentoUrl` es DONDE esta el curso, no que
// dice. Corregir una URL rota no es publicar una version nueva del curso: subir la version
// por eso le pide un acuse nuevo a gente que ya lo hizo.
//
// La distincion no es cosmetica. En una LECTURA la URL apunta al documento que se lee, y
// cambiarla apunta a OTRO documento: ahi versionar es correcto y sigue igual.
describe('cambiaElTexto · CURSO_VIRTUAL (REQ-SIG-26 · D-2)', () => {
  const CURSO: TextoVersionado = {
    titulo: 'Inducción Corporativa Cuantico',
    descripcion: 'Curso de inducción para todo el personal.',
    documentoCodigo: null,
    documentoNombre: 'Coursebox',
    documentoVersion: null,
    documentoUrl: 'https://my.coursebox.ai/curso/induccion',
  };

  it('corregir el enlace del curso NO sube la version', () => {
    expect(
      cambiaElTexto(CURSO, { documentoUrl: 'https://my.coursebox.ai/c/induccion-2026' }, 'CURSO_VIRTUAL'),
    ).toBe(false);
  });

  it('cambiar la plataforma tampoco', () => {
    expect(cambiaElTexto(CURSO, { documentoNombre: 'Otra plataforma' }, 'CURSO_VIRTUAL')).toBe(false);
  });

  it('cambiar el titulo SI sube la version', () => {
    expect(cambiaElTexto(CURSO, { titulo: 'Inducción Corporativa 2027' }, 'CURSO_VIRTUAL')).toBe(true);
  });

  it('cambiar la descripcion SI sube la version', () => {
    expect(cambiaElTexto(CURSO, { descripcion: 'Otra cosa' }, 'CURSO_VIRTUAL')).toBe(true);
  });

  // La misma URL, el mismo cambio, otro tipo: en una LECTURA sigue contando.
  it('en una LECTURA el enlace sigue contando', () => {
    expect(cambiaElTexto(ACTUAL, { documentoUrl: 'https://sharepoint/v3.pdf' }, 'LECTURA')).toBe(true);
  });
});

describe('versionAPublicar', () => {
  it('publica una version nueva cuando hay obligaciones', () => {
    const r = versionAPublicar(ACTUAL, { titulo: 'Otro título' }, true);
    expect(r.version).toBe(3);
    expect(r.publicar).toBe(true);
    expect(r.texto.titulo).toBe('Otro título');
    // Lo que no cambio se arrastra: la fila de version tiene que ser el texto COMPLETO que
    // se leyo, no solo el pedazo que se edito.
    expect(r.texto.documentoCodigo).toBe('POL-SIG-02');
  });

  it('sin obligaciones corrige la version vigente en vez de publicar', () => {
    const r = versionAPublicar(ACTUAL, { titulo: 'Otro título' }, false);
    expect(r.version).toBe(2);
    expect(r.publicar).toBe(false);
    expect(r.texto.titulo).toBe('Otro título');
  });

  // El texto de la version es el COMPLETO, siempre. Una fila con la descripcion vieja y el
  // titulo nuevo no es ninguna de las dos versiones.
  it('el texto sale completo aunque no se edite nada', () => {
    const r = versionAPublicar(ACTUAL, {}, true);
    expect(r.texto).toEqual({
      titulo: ACTUAL.titulo,
      descripcion: ACTUAL.descripcion,
      documentoCodigo: ACTUAL.documentoCodigo,
      documentoNombre: ACTUAL.documentoNombre,
      documentoVersion: ACTUAL.documentoVersion,
      documentoUrl: ACTUAL.documentoUrl,
    });
  });

  // D6 · «el versionado NO invalida». Esta funcion decide si nace una fila y NADA mas: no
  // cierra registros, no reabre asignaciones, no toca lo generado. Si algun dia devuelve
  // algo parecido a «reabrir», esta prueba obliga a leer la decision antes: que un cambio
  // de fondo deba obligar a leer de nuevo es una pregunta que el registro del 02/09/2026
  // deja ABIERTA, con la propuesta de que sea una accion explicita del lider del SIG.
  it('no devuelve nada que reabra o invalide', () => {
    const r = versionAPublicar(ACTUAL, { descripcion: 'Cambio de fondo' }, true);
    expect(Object.keys(r).sort()).toEqual(['publicar', 'texto', 'version']);
  });
});
