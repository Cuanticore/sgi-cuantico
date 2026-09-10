// lib/sig/__tests__/scorm-manifiesto.test.ts
//
// El manifiesto del paquete ENTREGADO está acá tal como viene (recortado a lo que importa),
// porque es el caso real: un paquete de DESPACHO cuyo contenido no está en el zip. La
// verificación 3 del requerimiento es exactamente esta prueba.

import { analizarManifiesto } from '../scorm-manifiesto';

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
