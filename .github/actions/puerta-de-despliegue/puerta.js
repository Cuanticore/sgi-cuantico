// .github/actions/puerta-de-despliegue/puerta.js
//
// **La puerta de despliegue, del lado del repositorio.**
//
// Un repositorio que va a publicar una versión en producción le pregunta al SGI si puede. Este
// archivo es todo lo que la action ejecuta.
//
// SIN DEPENDENCIAS, Y NO PUEDE TENERLAS. Corre en repositorios que no tienen este código ni
// este `node_modules`: repos de WordPress, de Python, de lo que sea. `fetch` es global desde
// Node 18 y los runners de GitHub traen 20 o más.
//
// LO QUE ESTE ARCHIVO **NO** DECIDE. No sabe qué hace falta para desplegar. Lee el vínculo,
// pregunta, y traduce la respuesta a algo que una persona pueda leer con el despliegue
// detenido. La norma vive en el SGI, en `lib/sig/puerta-de-despliegue.ts`, en un solo sitio —
// porque un producto como MinTrace tiene varios repositorios, y cuatro copias de la regla son
// cuatro respuestas distintas el día que el procedimiento cambie.
//
// SE PRUEBA EN EL REPOSITORIO DEL SGI, en `lib/__tests__/puerta-de-despliegue-action.test.ts`.
// Un archivo suelto en `.github/actions/` es justo la clase de cosa que nadie mira hasta el día
// que detiene un despliegue por el motivo equivocado.

'use strict';

const RUTA_VINCULO = '.sgi/sistema.yml';

/// El formato del código de sistema. El ID lo asigna el SIG; acá sólo se comprueba la forma,
/// porque un código mal escrito produciría un 404 y el mensaje hablaría de un sistema
/// inexistente en vez del error de dedo que de verdad pasó.
const FORMA_DEL_CODIGO = /^SIS-\d{3,}$/;

/// Lee `.sgi/sistema.yml`.
///
/// **Entiende `clave: valor` y nada más.** No es un analizador de YAML y no pretende serlo: un
/// documento con listas o mapas anidados es válido para YAML e incomprensible para esto, y
/// adivinar sería peor que fallar — la puerta consultaría por un sistema equivocado y
/// respondería que sí con total seguridad. Por eso cualquier línea que no tenga esa forma
/// revienta en vez de ignorarse.
function leerVinculo(texto) {
  const campos = {};

  for (const cruda of String(texto).split('\n')) {
    const linea = cruda.trim();
    if (linea === '' || linea.startsWith('#')) continue;

    const corte = linea.indexOf(':');
    if (corte === -1) {
      throw new Error(
        `${RUTA_VINCULO}: la línea «${linea}» no tiene la forma «clave: valor». Este archivo ` +
          'admite sólo pares simples; no uses listas ni anidamiento.',
      );
    }

    const clave = linea.slice(0, corte).trim();
    let valor = linea.slice(corte + 1).trim();

    if (valor === '') {
      throw new Error(
        `${RUTA_VINCULO}: la clave «${clave}» no tiene valor. Si pretendías una lista o un ` +
          'mapa anidado, este archivo no los admite.',
      );
    }

    // Mucha gente entrecomilla por costumbre, y las dos formas son YAML válido.
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }

    campos[clave] = valor;
  }

  if (!campos.sistema) {
    throw new Error(
      `${RUTA_VINCULO}: falta «sistema». Es el código de la hoja de vida a la que pertenece ` +
        'este repositorio, por ejemplo «SIS-001». Lo asigna el SIG.',
    );
  }
  if (!FORMA_DEL_CODIGO.test(campos.sistema)) {
    throw new Error(
      `${RUTA_VINCULO}: «${campos.sistema}» no tiene la forma de un código de sistema. Se ` +
        'espera «SIS-» y al menos tres dígitos, por ejemplo «SIS-001».',
    );
  }
  if (!campos.componente) {
    throw new Error(
      `${RUTA_VINCULO}: falta «componente». Es lo que distingue a este repositorio de los ` +
        'otros del mismo sistema —«backend-api», «web», «worker»—, porque un producto puede ' +
        'tener varios repositorios y una sola hoja de vida.',
    );
  }

  return { sistema: campos.sistema, componente: campos.componente };
}

/// El informe que se escribe en el resumen del despliegue.
///
/// Se listan TODOS los faltantes y no el primero: resolverlos de a uno obliga a un ciclo de
/// despliegue fallido por cada condición, y el expediente SIS-001 llegó a tener 19 hallazgos.
/// Nadie quiere enterarse de a uno.
function resumen(decision, baseDelSig) {
  const lineas = [];

  if (decision.puedeDesplegar) {
    lineas.push(`### Puerta de despliegue: autoriza`);
    lineas.push('');
    lineas.push(
      `\`${decision.sistema}\` — ${decision.nombre || ''} · versión \`${decision.version}\``,
    );
  } else {
    lineas.push(`### Puerta de despliegue: detenida`);
    lineas.push('');
    lineas.push(
      `\`${decision.sistema}\` — ${decision.nombre || ''} · versión \`${decision.version}\``,
    );
    lineas.push('');
    lineas.push('**Lo que impide desplegar:**');
    lineas.push('');
    for (const f of decision.faltantes || []) lineas.push(`- ${f}`);
  }

  // Los avisos van SIEMPRE después de los faltantes, y separados. Que no detengan no
  // significa que no importen: una hoja de vida con puertas en blanco es la que el expediente
  // SIS-001 tuvo el día de su auditoría.
  if ((decision.avisos || []).length > 0) {
    lineas.push('');
    lineas.push('**No detiene el despliegue, pero conviene mirarlo:**');
    lineas.push('');
    for (const a of decision.avisos) lineas.push(`- ${a}`);
  }

  lineas.push('');
  lineas.push(
    `La hoja de vida se diligencia en ${baseDelSig}/tecnologia/sistemas`,
  );

  return lineas.join('\n');
}

async function main() {
  const fs = require('node:fs');

  const base = (process.env.SGI_BASE || '').replace(/\/+$/, '');
  const token = process.env.SGI_TOKEN || '';
  const version = (process.env.VERSION || '').trim();

  if (base === '') throw new Error('Falta la entrada «sgi-base»: la URL del SIG.');
  if (token === '')
    throw new Error(
      'Falta el token de servicio. Emítelo en el SIG, en Tecnología › Tokens, con alcance ' +
        '«tecnologia:ver», y guárdalo como secreto del repositorio.',
    );
  if (version === '')
    throw new Error(
      'Falta la entrada «version». La autorización de paso a producción es por versión, no ' +
        'por sistema.',
    );

  if (!fs.existsSync(RUTA_VINCULO)) {
    throw new Error(
      `No existe ${RUTA_VINCULO}. Es el archivo que declara a qué sistema del SGI pertenece ` +
        'este repositorio. Dos líneas:\n\n  sistema: SIS-001\n  componente: backend-api\n',
    );
  }

  const vinculo = leerVinculo(fs.readFileSync(RUTA_VINCULO, 'utf8'));

  const url =
    `${base}/api/v1/sistemas/${encodeURIComponent(vinculo.sistema)}/puerta-de-despliegue` +
    `?version=${encodeURIComponent(version)}`;

  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (!r.ok) {
    // El cuerpo es `application/problem+json` y su `detail` está escrito para leerse. No se
    // vuelca la respuesta entera: podría traer datos del expediente al log de otro repositorio.
    let detalle = '';
    try {
      detalle = (await r.json()).detail || '';
    } catch {
      detalle = '';
    }
    throw new Error(`El SIG respondió ${r.status}. ${detalle}`);
  }

  const decision = await r.json();
  const texto = resumen(decision, base);

  console.log(texto);

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, texto + '\n');
  }

  if (!decision.puedeDesplegar) {
    // Salida distinta de cero: es lo único que detiene el trabajo de verdad.
    process.exitCode = 1;
  }
}

module.exports = { leerVinculo, resumen, RUTA_VINCULO };

// Sólo corre cuando se ejecuta como programa; al importarlo desde las pruebas, no.
if (require.main === module) {
  main().catch((e) => {
    console.error(`Puerta de despliegue: ${e.message}`);
    process.exitCode = 1;
  });
}
