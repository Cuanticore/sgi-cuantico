// lib/sgsi/__tests__/consolidado-ambiente.test.ts
//
// REQ-SIG-12 §4.2 · «Detalle de ambiente» → `Despliegue`.
//
// ─── Lo que esta hoja obligó a cambiar en el modelo ────────────────────────────────────
//
// La clave de idempotencia era `repoGithub + ambiente + servidor`. Sobre el libro real, las
// 129 filas colapsaban a **107**: se perdían 22 sin que nadie se enterara.
//
//   («-», «produccion», «srv-cuantico-toolbox»)  ×15  Coolify, Plane, n8n, Superset,
//                                                     Keycloak, Grafana, GlitchTip, Umami…
//   («-», «produccion», «Infraestructura ILC»)   ×3   Moodle 4.4, Moodle 4.3, Uptime Kuma
//   («monitor_unad_agents», «desarrollo», …)     ×3   Agents / worker / beat
//
// Los quince primeros son servicios de infraestructura SIN repositorio propio —el libro
// escribe «-»— corriendo en el mismo servidor y ambiente. El resto es un mismo repositorio
// desplegado como varios procesos. En los dos casos el `componente` es lo único que los
// separa, y separarlos es exactamente lo que la clave tiene que hacer: son despliegues
// DISTINTOS, no la misma fila importada dos veces.
//
// De ahí la migración `20260909100000_despliegue_componente_en_clave`. Con el componente
// adentro, las 129 quedan distintas y el §8.4 —«129 despliegues» Y «reimportar no
// duplica»— deja de ser una contradicción.

import { leerAmbiente, CLAVE_DESPLIEGUE } from '../consolidado-ambiente';

/// Una fila de la hoja por número de columna (1-based). La cabecera está en la fila 1 y los
/// datos arrancan en la 2.
function hoja(...filas: Record<number, string>[]): string[][] {
  const matriz: string[][] = [[]];
  for (const f of filas) {
    const celdas: string[] = [];
    for (let c = 1; c <= 25; c++) celdas.push(f[c] ?? '');
    matriz.push(celdas);
  }
  return matriz;
}

const SANA: Record<number, string> = {
  1: 'TEC-APP-0004',
  2: 'MINTRACE — backend',
  3: 'TEC-SER-0012',
  4: 'srv-cuantico-toolbox',
  5: 'PRODUCTOS',
  6: 'MINTRACE',
  7: 'Mintrace (backend)',
  8: 'API',
  9: 'mintrace_backend',
  10: 'produccion',
  11: 'Coolify',
  12: 'srv-cuantico-toolbox',
  13: '10.0.0.4',
  14: 'https://api.mintrace.co',
  15: 'ghcr.io/cuantico/mintrace:1.4',
  16: 'main',
  17: 'mintrace-api',
  18: '8000',
  19: 'mintrace_prod',
  20: 'running',
  21: 'docker ps 2026-09-01',
  22: 'alta',
  23: 'migrado del inventario viejo',
  24: 'toolbox',
  25: 'ok',
};

const con = (cambios: Record<number, string>) => ({ ...SANA, ...cambios });
const leer = (...filas: Record<number, string>[]) => leerAmbiente(hoja(...filas));

describe('el mapeo de columnas', () => {
  it('lleva las 17 columnas del modelo a sus campos', () => {
    const { despliegues } = leer(SANA);
    expect(despliegues).toHaveLength(1);
    expect(despliegues[0]).toMatchObject({
      fila: 2,
      activoCodigo: 'TEC-APP-0004',
      servidorCodigo: 'TEC-SER-0012',
      nombre: 'Mintrace (backend)',
      componente: 'API',
      repoGithub: 'mintrace_backend',
      ambiente: 'produccion',
      plataforma: 'Coolify',
      servidor: 'srv-cuantico-toolbox',
      ip: '10.0.0.4',
      url: 'https://api.mintrace.co',
      imagen: 'ghcr.io/cuantico/mintrace:1.4',
      tagRama: 'main',
      contenedorServicio: 'mintrace-api',
      puerto: '8000',
      baseDatos: 'mintrace_prod',
      estado: 'running',
      evidencia: 'docker ps 2026-09-01',
      confianza: 'ALTA',
      notas: 'migrado del inventario viejo',
    });
  });

  // Las columnas 2, 4, 5 y 6 son los nombres del padre y del servidor y su Nivel 1/2: están
  // para que la hoja se lea, y el modelo ya los tiene por la relación. Las 24 y 25 son
  // metadatos de cómo se armó el libro. Ninguna se guarda, y el §4.2 lo deja abierto:
  // volcarlas a `notas` pisaría la columna 23, que sí trae dato.
  it('las columnas de contexto y los metadatos de origen no se guardan', () => {
    const guardado = JSON.stringify(leer(SANA).despliegues[0]);
    // col 2 y 4: nombres del padre y del servidor · col 5 y 6: su Nivel 1/2 ·
    // col 24 y 25: cómo se armó el libro.
    for (const contexto of ['MINTRACE — backend', 'PRODUCTOS', 'MINTRACE', 'ok']) {
      expect(guardado).not.toContain(`"${contexto}"`);
    }
    // Y `notas` conserva la columna 23, que es la única que sí es del modelo.
    expect(leer(SANA).despliegues[0].notas).toBe('migrado del inventario viejo');
  });

  it('una columna opcional vacía queda nula, no cadena vacía', () => {
    const { despliegues } = leer(con({ 13: '', 14: '', 23: '' }));
    expect(despliegues[0].ip).toBeNull();
    expect(despliegues[0].url).toBeNull();
    expect(despliegues[0].notas).toBeNull();
  });
});

// ─── H-41 · 58 filas no traen activo padre ─────────────────────────────────────────────

describe('H-41 · componentes sin activo padre', () => {
  // «Se cargan, se cuentan y se ven; no se descartan en silencio». Un componente que nadie
  // asoció es justo el que hay que ir a mirar.
  it('sin activo padre se carga igual, pendiente de asociar', () => {
    const { despliegues, avisos } = leer(con({ 1: '' }));
    expect(despliegues).toHaveLength(1);
    expect(despliegues[0].activoCodigo).toBeNull();
    expect(avisos).toHaveLength(1);
    expect(avisos[0].mensaje).toContain('PENDIENTE DE ASOCIAR');
  });

  it('sin servidor padre se carga igual', () => {
    const { despliegues } = leer(con({ 3: '' }));
    expect(despliegues[0].servidorCodigo).toBeNull();
  });

  // Un código escrito pero mal formado no es lo mismo que uno ausente: alguien intentó
  // asociarlo y le erró. Se carga sin asociar y se dice cuál era.
  it('un código de padre mal formado se avisa con el texto que traía', () => {
    const { despliegues, avisos } = leer(con({ 1: 'TEC-APP-4' }));
    expect(despliegues[0].activoCodigo).toBeNull();
    expect(avisos[0].mensaje).toContain('TEC-APP-4');
  });
});

// ─── La clave de idempotencia (E6) ─────────────────────────────────────────────────────

describe('la clave de idempotencia', () => {
  it('es repo + ambiente + servidor + componente', () => {
    expect(CLAVE_DESPLIEGUE).toEqual(['repoGithub', 'ambiente', 'servidor', 'componente']);
  });

  // EL CASO DEL LIBRO. Quince servicios comparten repo «-», ambiente y servidor, y sólo el
  // componente los separa. Sin él en la clave, catorce se perdían.
  it('el componente separa dos servicios del mismo servidor y ambiente', () => {
    const { despliegues, avisos } = leer(
      con({ 7: 'Coolify', 8: 'Panel de despliegue', 9: '-' }),
      con({ 7: 'Superset', 8: 'BI / dashboards', 9: '-' }),
    );
    expect(despliegues).toHaveLength(2);
    expect(avisos).toEqual([]);
  });

  it('el mismo repo con API, worker y beat son tres despliegues', () => {
    const { despliegues } = leer(
      con({ 8: 'Agents' }),
      con({ 8: 'Agents worker' }),
      con({ 8: 'Agents beat' }),
    );
    expect(despliegues).toHaveLength(3);
  });

  // Dos filas con la MISMA clave dentro de un archivo no son dos despliegues: la segunda
  // pisaría a la primera en el upsert y el conteo final mentiría. Se reporta la colisión en
  // vez de perder la fila callado.
  it('dos filas con la misma clave se reportan en vez de pisarse', () => {
    const { despliegues, colisiones } = leer(SANA, con({ 20: 'DETENIDO' }));
    expect(despliegues).toHaveLength(1);
    expect(colisiones).toHaveLength(1);
    expect(colisiones[0].fila).toBe(3);
    expect(colisiones[0].mensaje).toContain('fila 2');
  });

  // `NULLS NOT DISTINCT` hace que dos nulos choquen en la base. La lectura tiene que
  // detectarlo igual, o la colisión aparecería recién al escribir, dentro de la
  // transacción, como un error de base de datos que nadie sabe traducir.
  it('dos nulos chocan, igual que en la base con NULLS NOT DISTINCT', () => {
    const { colisiones } = leer(con({ 9: '', 8: '' }), con({ 9: '', 8: '', 20: 'otro' }));
    expect(colisiones).toHaveLength(1);
  });
});

// ─── Las columnas que el modelo exige ──────────────────────────────────────────────────

describe('lo que `Despliegue` no admite en blanco', () => {
  it.each([
    ['nombre', 7],
    ['ambiente', 10],
    ['estado', 20],
  ])('sin %s la fila se rechaza: la columna es NOT NULL', (_q, col) => {
    const { despliegues, rechazadas } = leer(con({ [col]: '' }));
    expect(despliegues).toHaveLength(0);
    expect(rechazadas).toHaveLength(1);
    expect(rechazadas[0].fila).toBe(2);
  });
});

describe('la confianza', () => {
  it.each([
    ['alta', 'ALTA'],
    ['media', 'MEDIA'],
    ['baja', 'BAJA'],
    ['ALTA', 'ALTA'],
  ])('«%s» → %s', (escrito, esperado) => {
    expect(leer(con({ 22: escrito })).despliegues[0].confianza).toBe(esperado);
  });

  // Un dato inferido y uno confirmado no valen igual. Ante algo que no se entiende, MEDIA
  // —el defecto del esquema— y un aviso: subirlo a ALTA sería afirmar que alguien lo
  // verificó.
  it('lo que no se reconoce cae en MEDIA y se avisa, nunca en ALTA', () => {
    const { despliegues, avisos } = leer(con({ 22: 'razonable' }));
    expect(despliegues[0].confianza).toBe('MEDIA');
    expect(avisos).toHaveLength(1);
  });

  it('vacía es MEDIA y no avisa: el esquema ya dice eso', () => {
    const { despliegues, avisos } = leer(con({ 22: '' }));
    expect(despliegues[0].confianza).toBe('MEDIA');
    expect(avisos).toEqual([]);
  });
});

describe('el recorrido de la hoja', () => {
  it('los datos arrancan en la fila 2', () => {
    expect(leer(SANA).despliegues[0].fila).toBe(2);
  });

  it('una fila en blanco se saltea sin ruido', () => {
    const { despliegues, rechazadas, avisos } = leer(SANA, {}, con({ 8: 'Worker' }));
    expect(despliegues).toHaveLength(2);
    expect(rechazadas).toEqual([]);
    expect(avisos).toEqual([]);
  });

  it('una hoja vacía no devuelve nada ni revienta', () => {
    expect(leerAmbiente(hoja())).toEqual({
      despliegues: [],
      rechazadas: [],
      avisos: [],
      colisiones: [],
    });
  });
});
