// lib/sig/__tests__/despliegues.test.ts
//
// E6 · reimportar actualiza, no duplica. E7 · lo que no reconoce su activo padre queda
// pendiente, visible y contado — no se descarta en silencio.

import {
  llaveDeDespliegue,
  planificarImportacion,
  resolverActivoPadre,
  resumirDespliegues,
  type FilaImportada,
} from '../despliegues';

const fila = (p: Partial<FilaImportada>): FilaImportada => ({
  nombre: 'servicio',
  componente: null,
  repoGithub: null,
  ambiente: 'produccion',
  plataforma: null,
  servidor: null,
  ip: null,
  url: null,
  imagen: null,
  tagRama: null,
  contenedorServicio: null,
  puerto: null,
  baseDatos: null,
  estado: 'activo',
  evidencia: null,
  confianza: 'MEDIA',
  notas: null,
  ...p,
});

describe('llaveDeDespliegue — los nulos cuentan como valor', () => {
  it('dos filas del mismo repo y ambiente sin servidor son la MISMA', () => {
    // En SQL estándar dos nulos son distintos, y por eso el índice lleva NULLS NOT
    // DISTINCT. Acá la llave tiene que decir lo mismo, o el plan y la base discreparían.
    const a = llaveDeDespliegue({ repoGithub: 'org/crm', ambiente: 'staging', servidor: null });
    const b = llaveDeDespliegue({ repoGithub: 'org/crm', ambiente: 'staging', servidor: null });
    expect(a).toBe(b);
  });

  it('ignora mayúsculas y espacios de borde', () => {
    // Una diferencia de mayúsculas no es un despliegue distinto.
    expect(llaveDeDespliegue({ repoGithub: ' Org/CRM ', ambiente: 'Staging', servidor: null })).toBe(
      llaveDeDespliegue({ repoGithub: 'org/crm', ambiente: 'staging', servidor: null }),
    );
  });

  it('cadena vacía y nulo son lo mismo', () => {
    expect(llaveDeDespliegue({ repoGithub: '', ambiente: 'x', servidor: null })).toBe(
      llaveDeDespliegue({ repoGithub: null, ambiente: 'x', servidor: '' }),
    );
  });

  it('el servidor sí distingue cuando se conoce', () => {
    expect(llaveDeDespliegue({ repoGithub: 'org/crm', ambiente: 'prod', servidor: 'srv1' })).not.toBe(
      llaveDeDespliegue({ repoGithub: 'org/crm', ambiente: 'prod', servidor: 'srv2' }),
    );
  });
});

describe('planificarImportacion — E6, reimportar no duplica', () => {
  const filas = [
    fila({ repoGithub: 'org/crm', ambiente: 'staging' }),
    fila({ repoGithub: 'org/crm', ambiente: 'produccion' }),
  ];

  it('la primera vez crea todo', () => {
    const p = planificarImportacion(filas, new Set());
    expect(p.crear).toHaveLength(2);
    expect(p.actualizar).toHaveLength(0);
  });

  it('la segunda vez no crea nada', () => {
    // Es el criterio de aceptación: reimportar las 130 filas no crea duplicados.
    const llaves = new Set(filas.map(llaveDeDespliegue));
    const p = planificarImportacion(filas, llaves);
    expect(p.crear).toHaveLength(0);
    expect(p.actualizar).toHaveLength(2);
  });

  it('cuenta las repetidas DENTRO del archivo, aparte', () => {
    // No son un error de la importación anterior: son un problema del archivo, y decir
    // «actualizado» las escondería.
    const conRepetida = [...filas, fila({ repoGithub: 'org/crm', ambiente: 'staging', notas: 'corregida' })];
    const p = planificarImportacion(conRepetida, new Set());
    expect(p.duplicadasEnElArchivo).toBe(1);
    expect(p.crear).toHaveLength(2);
  });

  it('dentro del archivo gana la ÚLTIMA aparición', () => {
    // La de más abajo suele ser la corrección de la de arriba.
    const conRepetida = [
      fila({ repoGithub: 'org/crm', ambiente: 'staging', notas: 'vieja' }),
      fila({ repoGithub: 'org/crm', ambiente: 'staging', notas: 'corregida' }),
    ];
    const p = planificarImportacion(conRepetida, new Set());
    expect(p.crear[0].notas).toBe('corregida');
  });
});

describe('resolverActivoPadre — E7, null es un resultado legítimo', () => {
  const activos = [
    { id: 1, nombre: 'CRM comercial', codigo: 'APP-SW-0001' },
    { id: 2, nombre: 'Portal MINTRACE', codigo: 'APP-SW-0002' },
    { id: 3, nombre: 'Base de datos postgres', codigo: 'DAT-DB-0001' },
  ];

  it('resuelve por componente antes que por nombre', () => {
    expect(resolverActivoPadre({ nombre: 'contenedor-x', componente: 'CRM comercial' }, activos)).toBe(1);
  });

  it('resuelve por contención', () => {
    expect(resolverActivoPadre({ nombre: 'mintrace', componente: null }, activos)).toBe(2);
  });

  it('con DOS candidatos devuelve null en vez de elegir el primero', () => {
    // Elegir asociaría el despliegue al activo equivocado y nadie volvería a mirarlo: peor
    // que dejarlo pendiente.
    const ambiguos = [
      { id: 1, nombre: 'API pagos', codigo: null },
      { id: 2, nombre: 'API pagos legacy', codigo: null },
    ];
    expect(resolverActivoPadre({ nombre: 'API pagos', componente: null }, ambiguos)).toBeNull();
  });

  it('sin coincidencia devuelve null, y eso queda pendiente de asociar', () => {
    expect(resolverActivoPadre({ nombre: 'servicio-desconocido', componente: null }, activos)).toBeNull();
  });

  it('un componente vacío no impide intentar por nombre', () => {
    expect(resolverActivoPadre({ nombre: 'CRM comercial', componente: '  ' }, activos)).toBe(1);
  });
});

describe('resumirDespliegues — contar los legacy es el punto', () => {
  const filas = [
    { activoId: 1, ambiente: 'produccion', estado: 'activo', confianza: 'ALTA' as const },
    { activoId: null, ambiente: 'produccion', estado: 'legacy', confianza: 'BAJA' as const },
    { activoId: null, ambiente: 'staging', estado: 'legacy', confianza: 'BAJA' as const },
  ];

  it('cuenta los pendientes de asociar', () => {
    expect(resumirDespliegues(filas).pendientesDeAsociar).toBe(2);
  });

  it('agrupa por estado, del más frecuente al menos', () => {
    // Sin esto no se puede contar cuántos servicios legacy hay, que es lo que el
    // levantamiento encontró.
    expect(resumirDespliegues(filas).porEstado[0]).toEqual({ estado: 'legacy', cantidad: 2 });
  });

  it('cuenta los de confianza baja', () => {
    expect(resumirDespliegues(filas).confianzaBaja).toBe(2);
  });

  it('una lista vacía no rompe', () => {
    const r = resumirDespliegues([]);
    expect(r.total).toBe(0);
    expect(r.porAmbiente).toEqual([]);
  });
});
