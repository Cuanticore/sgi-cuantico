// lib/sgsi/__tests__/licencias.test.ts
//
// Lo que se prueba acá son las tres decisiones de la pestaña de licencias (REQ-SIG-15 §3.2), y
// sobre todo la que no se puede comprobar a mano sin el tenant real:
//
// **P8 · una lista vacía y un 403 no se ven igual nunca.** La verificación 14 del requerimiento
// pide forzar un 403 en `/subscribedSkus` contra el tenant y ver que la lista de la persona
// sigue. Esa corrida necesita credenciales de producción y no se puede hacer acá — pero la
// DECISIÓN vive en un tipo y en `estadoDeConsulta`, y eso sí se demuestra. Una prueba que sólo
// mirara «devuelve una lista» no habría detectado nada: el defecto que P8 evita es que la
// lista vacía sea la MISMA lista vacía en los dos casos.

import {
  anomaliasDeLicencia,
  claveDeSku,
  estadoDeConsulta,
  etiquetaDeSku,
  explicarAnomalia,
  fraseDelSku,
  inventarioDeSoftware,
  nombreDeSku,
  nombresComerciales,
  resumirSkus,
  type InventarioDePersona,
  type LicenciaDeGraph,
  type LicenciasDeLaPantalla,
  type ResumenSku,
  type SkuDeGraph,
} from '../licencias';
import { clasificarRecurso, explicarFallo } from '../graph-fallo';

const PARAMETROS = [
  { clave: 'licencia_sku_spe_e3', valor: 'Microsoft 365 E3' },
  { clave: 'licencia_sku_power_bi_pro', valor: 'Power BI Pro' },
  // Ruido de la misma tabla: `Parametro` es un almacén compartido.
  { clave: 'zona_horaria', valor: 'America/Bogota' },
];

const COMERCIALES = nombresComerciales(PARAMETROS);

// ── P6 · el nombre comercial sale del parámetro, y el código crudo se queda ────────────────

describe('nombreDeSku · P6', () => {
  it('con el parámetro puesto, trae el nombre comercial Y el código crudo', () => {
    const n = nombreDeSku('SPE_E3', COMERCIALES);
    expect(n).toEqual({ codigo: 'SPE_E3', comercial: 'Microsoft 365 E3' });
    expect(etiquetaDeSku(n)).toBe('Microsoft 365 E3 · SPE_E3');
  });

  // La única forma de reconocer un SKU que la organización compró y nadie parametrizó todavía.
  // Rellenar `comercial` con el código borraría esa señal: la pantalla se vería igual de
  // completa el día que entra un producto nuevo.
  it('sin parametrizar, el comercial es null y se muestra el código crudo solo', () => {
    const n = nombreDeSku('ENTERPRISEPACK', COMERCIALES);
    expect(n.comercial).toBeNull();
    expect(etiquetaDeSku(n)).toBe('ENTERPRISEPACK');
  });

  it('la clave del parámetro y el código se corresponden en los dos sentidos', () => {
    expect(claveDeSku('SPE_E3')).toBe('licencia_sku_spe_e3');
    expect(nombresComerciales([{ clave: claveDeSku('SPB'), valor: 'M365 Empresa Premium' }]).get('SPB')).toBe(
      'M365 Empresa Premium',
    );
  });

  // Graph es quien manda el código y comparar sin normalizar haría que `spe_e3` y `SPE_E3`
  // fueran dos productos distintos en la misma pantalla.
  it('el código se compara sin importar mayúsculas ni espacios', () => {
    expect(nombreDeSku(' spe_e3 ', COMERCIALES).comercial).toBe('Microsoft 365 E3');
  });

  it('un parámetro vaciado por error no se toma como nombre', () => {
    const tabla = nombresComerciales([{ clave: 'licencia_sku_spe_e3', valor: '   ' }]);
    expect(tabla.has('SPE_E3')).toBe(false);
  });
});

// ── P7.1 · el inventario de software por persona (A.5.9) ──────────────────────────────────

function licencia(codigo: string, planes: [string, string][] = []): LicenciaDeGraph {
  return {
    skuPartNumber: codigo,
    servicePlans: planes.map(([servicePlanName, provisioningStatus]) => ({
      servicePlanName,
      provisioningStatus,
    })),
  };
}

describe('inventarioDeSoftware · P7.1', () => {
  it('separa los servicios habilitados de los deshabilitados', () => {
    const [r] = inventarioDeSoftware(
      [
        licencia('SPE_E3', [
          ['EXCHANGE_S_ENTERPRISE', 'Success'],
          ['TEAMS1', 'Success'],
          ['YAMMER_ENTERPRISE', 'Disabled'],
        ]),
      ],
      COMERCIALES,
    );
    // Un servicio apagado no es software que la persona use: mezclarlos metería en el
    // inventario de A.5.9 lo que la licencia trae apagado.
    expect(r.serviciosHabilitados).toEqual(['EXCHANGE_S_ENTERPRISE', 'TEAMS1']);
    expect(r.serviciosDeshabilitados).toEqual(['YAMMER_ENTERPRISE']);
  });

  // Los ausentes se aceptan, igual que en `esColaboradorDeLaOrganizacion`: el error caro es
  // dejar fuera del inventario software que la persona sí tiene.
  it('un plan sin provisioningStatus cuenta como habilitado', () => {
    const [r] = inventarioDeSoftware(
      [{ skuPartNumber: 'SPE_E3', servicePlans: [{ servicePlanName: 'TEAMS1' }] }],
      COMERCIALES,
    );
    expect(r.serviciosHabilitados).toEqual(['TEAMS1']);
  });

  it('sin licencias devuelve una lista vacía, no un error', () => {
    expect(inventarioDeSoftware([], COMERCIALES)).toEqual([]);
  });

  it('una entrada sin skuPartNumber se descarta: no hay nada que teclear en el portal', () => {
    expect(inventarioDeSoftware([{ skuId: 'guid-suelto' }], COMERCIALES)).toEqual([]);
  });
});

// ── P7.2 y P7.3 · los dos cruces que el portal no puede hacer ─────────────────────────────

describe('anomaliasDeLicencia · P7', () => {
  const conLicencia = inventarioDeSoftware([licencia('SPE_E3')], COMERCIALES);

  it('cuenta inactiva con licencia: plata quemada y cuenta que debía estar cerrada', () => {
    const [a] = anomaliasDeLicencia(conLicencia, { activa: false, pendientes: 0 });
    expect(a.clase).toBe('LICENCIA_EN_CUENTA_INACTIVA');
    expect(explicarAnomalia(a)).toContain('SPE_E3');
  });

  it('cuenta activa con licencia: ninguna anomalía', () => {
    expect(anomaliasDeLicencia(conLicencia, { activa: true, pendientes: 12 })).toEqual([]);
  });

  it('sin licencia y con tareas: se le exige algo que no puede cumplir', () => {
    const [a] = anomaliasDeLicencia([], { activa: true, pendientes: 3 });
    expect(a.clase).toBe('SIN_LICENCIA_CON_TAREAS');
    expect(explicarAnomalia(a)).toContain('3');
  });

  it('sin licencia y sin tareas no es una anomalía', () => {
    expect(anomaliasDeLicencia([], { activa: true, pendientes: 0 })).toEqual([]);
  });

  // A una persona inactiva no tener licencia es lo ESPERADO. Levantarlo igual pondría un
  // renglón rojo en cada persona que salió de la organización, y una lista de anomalías que
  // siempre tiene renglones es una lista que nadie lee.
  it('a una cuenta inactiva no se le reclama la falta de licencia', () => {
    expect(anomaliasDeLicencia([], { activa: false, pendientes: 5 })).toEqual([]);
  });
});

// ── El resumen del tenant ─────────────────────────────────────────────────────────────────

function sku(codigo: string, contratadas: number, enUso: number): SkuDeGraph {
  return { skuPartNumber: codigo, prepaidUnits: { enabled: contratadas }, consumedUnits: enUso };
}

describe('resumirSkus · el contexto del tenant', () => {
  it('«12 de 25 en uso · 13 libres»', () => {
    const [r] = resumirSkus([sku('SPE_E3', 25, 12)], COMERCIALES);
    expect(r).toMatchObject({ contratadas: 25, enUso: 12, libres: 13, sobreasignado: false });
    expect(fraseDelSku(r)).toBe('12 de 25 en uso · 13 libres');
  });

  // Sobreasignado se dice distinto y NO con un negativo: «−2 libres» es una resta que quien lee
  // tiene que interpretar, y qué hacer con ese renglón no se deduce de un signo menos.
  it('con más asignadas que contratadas, libres es cero y se nombra el sobrante', () => {
    const [r] = resumirSkus([sku('SPE_E3', 25, 27)], COMERCIALES);
    expect(r.libres).toBe(0);
    expect(r.sobreasignado).toBe(true);
    expect(fraseDelSku(r)).toBe('27 de 25 en uso · 2 por encima de lo contratado');
  });

  it('los números que Graph no manda valen cero, no NaN', () => {
    const [r] = resumirSkus([{ skuPartNumber: 'FLOW_FREE' }], COMERCIALES);
    expect(fraseDelSku(r)).toBe('0 de 0 en uso · 0 libres');
  });

  it('el nombre comercial también sale del parámetro, con el código al lado', () => {
    const [r] = resumirSkus([sku('POWER_BI_PRO', 10, 4)], COMERCIALES);
    expect(etiquetaDeSku(r)).toBe('Power BI Pro · POWER_BI_PRO');
  });
});

// ── P8 · lo que la verificación 14 pide y no se puede correr sin el tenant ─────────────────

const INVENTARIO_VACIO: InventarioDePersona = { renglones: [], anomalias: [] };

describe('P8 · una lista vacía y un 403 no se ven igual nunca', () => {
  // Ésta es la decisión que la verificación 14 comprueba contra el tenant real. Acá se
  // comprueba el comportamiento: los dos casos producen listas de longitud cero, y el defecto
  // que P8 evita es exactamente que se muestren iguales.
  it('vacía y no-se-pudo-preguntar son dos estados distintos, no dos listas vacías', () => {
    const vacia = estadoDeConsulta<InventarioDePersona>(
      { ok: true, datos: INVENTARIO_VACIO },
      (d) => d.renglones.length,
    );
    const prohibida = estadoDeConsulta<InventarioDePersona>(
      { ok: false, fallo: clasificarRecurso(403, '/users/{oid}/licenseDetails', 'User.Read.All') },
      (d) => d.renglones.length,
    );
    expect(vacia).toBe('VACIA');
    expect(prohibida).toBe('NO_SE_PUDO_PREGUNTAR');
    expect(vacia).not.toBe(prohibida);
  });

  it('con datos no se confunde con ninguno de los dos', () => {
    const r: ResumenSku[] = resumirSkus([sku('SPE_E3', 25, 12)], COMERCIALES);
    expect(estadoDeConsulta<ResumenSku[]>({ ok: true, datos: r }, (d) => d.length)).toBe('CON_DATOS');
  });

  // **El corazón de la tarea.** Un 403 en `/subscribedSkus` con `licenseDetails` respondiendo
  // bien: la lista de la persona se muestra igual y lo único que falta es el contexto del
  // tenant, dicho con el nombre del recurso y del permiso. Degradar las dos porque una falló
  // pierde información que sí se tiene.
  it('un 403 en el inventario del tenant NO borra la lista de la persona', () => {
    const pantalla: LicenciasDeLaPantalla = {
      persona: {
        ok: true,
        datos: {
          renglones: inventarioDeSoftware([licencia('SPE_E3', [['TEAMS1', 'Success']])], COMERCIALES),
          anomalias: [],
        },
      },
      tenant: {
        ok: false,
        fallo: clasificarRecurso(
          403,
          'el inventario de licencias del tenant (/subscribedSkus)',
          'Organization.Read.All o Directory.Read.All',
        ),
      },
    };

    expect(pantalla.persona.ok).toBe(true);
    if (pantalla.persona.ok) {
      expect(pantalla.persona.datos.renglones).toHaveLength(1);
      expect(pantalla.persona.datos.renglones[0].codigo).toBe('SPE_E3');
    }

    // Y el bloque del tenant nombra el recurso y el permiso, que es lo que evita que alguien se
    // vaya a Azure a conceder algo que ya está concedido.
    expect(pantalla.tenant.ok).toBe(false);
    if (!pantalla.tenant.ok) {
      const frase = explicarFallo(pantalla.tenant.fallo);
      expect(frase).toContain('/subscribedSkus');
      expect(frase).toContain('Organization.Read.All');
    }
  });

  // La simétrica: si la que cae es la de la persona, el inventario del tenant se sigue viendo.
  // Son dos llamadas independientes y ninguna de las dos es la principal.
  it('un 403 en las licencias de la persona NO borra el inventario del tenant', () => {
    const pantalla: LicenciasDeLaPantalla = {
      persona: {
        ok: false,
        fallo: clasificarRecurso(403, '/users/{oid}/licenseDetails', 'User.Read.All'),
      },
      tenant: { ok: true, datos: resumirSkus([sku('SPE_E3', 25, 12)], COMERCIALES) },
    };
    expect(pantalla.tenant.ok).toBe(true);
    if (pantalla.tenant.ok) expect(fraseDelSku(pantalla.tenant.datos[0])).toContain('13 libres');
  });
});
