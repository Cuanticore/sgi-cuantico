// lib/sgsi/__tests__/eficacia-agregada.test.ts
//
// REQ-SIG-21 · la regla de eficacia agregada de MET-SIG-01 §7.4, con los presupuestos
// 70 / 20 / 10 de §4.
//
// POR QUÉ ESTE ARCHIVO EXISTE AUNQUE LA REGLA ESTÉ APAGADA
//
// Los 272 pares de `ControlAmenaza` siguen con `relevanciaId` en null, así que HOY ninguna
// amenaza tiene principal designado y las 57 se calculan por la rama v2 —media simple, sin
// techo—. La regla nueva es, a propósito, INERTE: el residual de los 725 riesgos vigentes
// no se mueve por este cambio, y eso es lo correcto. Asignar relevancias es criterio del
// líder del SIG (§6), no trabajo de desarrollo, y inventarlas sería decidir solo sobre el
// análisis de riesgos de la organización.
//
// Lo que estas pruebas garantizan es lo otro: que el día que llegue la primera relevancia
// la regla funcione. Por eso recorren el camino con principal designado aunque hoy no haya
// ninguno, y por eso la última sección fija que el camino sin principal sigue dando
// exactamente lo de antes.
//
// EL CASO DE PRUEBA es la tabla de §4, medida sobre `A.11 Acceso no autorizado` con un
// inherente de 32: se mueve SOLO el nivel del control principal y se mira qué hace el
// residual. Con la media plana de hoy el modelo casi no reacciona; con el techo, cuando el
// principal cae a L1 o L0 el riesgo salta a Crítico y vuelve a rozar el inherente.

import { clasificar } from '../clasificar';
import { calcularRiesgo } from '../formulas';
import {
  PRESUPUESTO_CLASE,
  claseDeControl,
  desglosarEficaciaAmenaza,
  eficaciaAmenaza,
  validarDesignacionPrincipal,
  type ControlAgregable,
} from '../madurez';

/// Las bandas de `prisma/data/escalas.json`, las mismas que clasifican en pantalla.
const BANDAS = [
  { nombre: 'Crítico', desde: 25, hasta: 100000 },
  { nombre: 'Alto', desde: 5, hasta: 24.999 },
  { nombre: 'Medio', desde: 0.5, hasta: 4.999 },
  { nombre: 'Bajo', desde: 0, hasta: 0.499 },
];

/// Pesos del catálogo `RelevanciaControl`: Principal 3, Complementario 2, De apoyo 1.
const PRINCIPAL = (nivel: number | null): ControlAgregable => ({
  nivel,
  peso: 3,
  esPrincipal: true,
});
const SECUNDARIO = (nivel: number | null): ControlAgregable => ({
  nivel,
  peso: 2,
  esPrincipal: false,
});
const COMPLEMENTARIO = (nivel: number | null): ControlAgregable => ({
  nivel,
  peso: 1,
  esPrincipal: false,
});

/// La amenaza de §4: un principal de nivel variable, dos secundarios en L4 (media 95 %) y
/// un complementario en L3 (90 %).
function amenazaDeLaTabla(nivelPrincipal: number | null): ControlAgregable[] {
  return [PRINCIPAL(nivelPrincipal), SECUNDARIO(4), SECUNDARIO(4), COMPLEMENTARIO(3)];
}

/// El residual sobre el inherente 32 de §3.1, por la MISMA `calcularRiesgo` que escribe
/// `Riesgo.riesgoResidual`: impacto 5 × ARO 6.4 = 32.
function residualSobreInherente32(eficacia: number): { residual: number; banda: string | null } {
  const salida = calcularRiesgo({
    valores: { D: 5, I: 5, C: 4 },
    degradaciones: { D: '1.00', I: '0', C: '0' },
    aro: 6.4,
    eficacia,
  });
  expect(salida.riesgoPotencial.toNumber()).toBeCloseTo(32, 10);
  return {
    residual: salida.riesgoResidual.toNumber(),
    banda: clasificar(salida.riesgoResidual, BANDAS),
  };
}

describe('REQ-SIG-21 §4 · la tabla, con techo y sin techo', () => {
  // | Principal | sin techo            | con techo             |
  // | L4        | 94.5 % -> 1.76 Medio | 94.5 % -> 1.76 Medio  |
  // | L2        | 63.0 % -> 11.84 Alto | 55.0 % -> 14.40 Alto  |
  // | L1        | 35.0 % -> 20.80 Alto | 15.0 % -> 27.20 Crítico
  // | L0        | 28.0 % -> 23.04 Alto |  5.0 % -> 30.40 Crítico
  const tabla = [
    { nivel: 4, bruta: 0.945, resBruta: 1.76, bandaBruta: 'Medio', e: 0.945, res: 1.76, banda: 'Medio' },
    { nivel: 2, bruta: 0.63, resBruta: 11.84, bandaBruta: 'Alto', e: 0.55, res: 14.4, banda: 'Alto' },
    { nivel: 1, bruta: 0.35, resBruta: 20.8, bandaBruta: 'Alto', e: 0.15, res: 27.2, banda: 'Crítico' },
    { nivel: 0, bruta: 0.28, resBruta: 23.04, bandaBruta: 'Alto', e: 0.05, res: 30.4, banda: 'Crítico' },
  ];

  it.each(tabla)(
    'con el principal en L$nivel: bruta $bruta, eficacia $e, residual $res ($banda)',
    ({ nivel, bruta, resBruta, bandaBruta, e, res, banda }) => {
      const d = desglosarEficaciaAmenaza(amenazaDeLaTabla(nivel));

      expect(d.regla).toBe('ponderada-acotada');
      // SIN techo: la media ponderada por presupuesto, antes del recorte.
      expect(d.bruta).toBeCloseTo(bruta, 10);
      expect(residualSobreInherente32(bruta).residual).toBeCloseTo(resBruta, 10);
      expect(residualSobreInherente32(bruta).banda).toBe(bandaBruta);

      // CON techo: la regla aprobada.
      expect(d.eficacia).toBeCloseTo(e, 10);
      const conTecho = residualSobreInherente32(e);
      expect(conTecho.residual).toBeCloseTo(res, 10);
      expect(conTecho.banda).toBe(banda);
    },
  );

  it('el modelo REACCIONA cuando el control principal se degrada', () => {
    // Criterio de aceptación 3 · prueba de sensibilidad. Bajar el principal un nivel mueve
    // el residual, y de L2 para abajo lo hace saltar de banda. Con la media plana de hoy
    // los cuatro escenarios caen todos en Medio/Alto y la caída a L0 casi no se nota.
    const bandas = [4, 3, 2, 1, 0].map(
      (n) => residualSobreInherente32(eficaciaAmenaza(amenazaDeLaTabla(n)) as number).banda,
    );
    expect(bandas).toEqual(['Medio', 'Medio', 'Alto', 'Crítico', 'Crítico']);
  });
});

describe('REQ-SIG-21 §4 · el techo no es opcional', () => {
  it('sin techo, 70/20/10 mete un PISO INCONDICIONAL del 30 %', () => {
    // Esta es la razón escrita de por qué el techo se queda. Con el principal en L0 —el
    // control NO EXISTE— las otras dos clases aportan su presupuesto pase lo que pase: la
    // bruta lee 28 % y el residual baja de 32 a 23.04, «Alto». Eso reintroduce por otra
    // puerta el mismo enmascaramiento que la media simple producía.
    const d = desglosarEficaciaAmenaza(amenazaDeLaTabla(0));
    expect(d.bruta).toBeCloseTo(0.28, 10);
    expect(d.bruta).toBeGreaterThan(0.2);

    // El piso llega a 0.30 exacto cuando secundarios y complementarios están perfectos.
    const perfectos = desglosarEficaciaAmenaza([PRINCIPAL(0), SECUNDARIO(5), COMPLEMENTARIO(5)]);
    expect(perfectos.bruta).toBeCloseTo(0.3, 10);

    // Con el techo, el mismo caso da 5 % y el residual vuelve a rozar el inherente: 30.40
    // sobre 32, «Crítico». Que es la verdad.
    expect(d.eficacia).toBeCloseTo(0.05, 10);
    expect(d.techoActua).toBe(true);
    expect(residualSobreInherente32(d.eficacia as number).banda).toBe('Crítico');
  });

  it('el techo solo actúa cuando el principal está débil', () => {
    const fuerte = desglosarEficaciaAmenaza(amenazaDeLaTabla(4));
    expect(fuerte.techoActua).toBe(false);
    expect(fuerte.eficacia).toBe(fuerte.bruta);

    const debil = desglosarEficaciaAmenaza(amenazaDeLaTabla(2));
    expect(debil.techoActua).toBe(true);
    expect(debil.eficacia).toBeLessThan(debil.bruta as number);
  });

  it('δ sale del parámetro, no de una constante del código', () => {
    // `delta_techo_eficacia` vale 0.05 y se queda ahí (§5, D-2), pero la función lo recibe:
    // ponerlo en 0 es «que mande solo el principal», y entre 0 y 0.05 no cambia ninguna
    // banda en los cuatro escenarios de la tabla.
    expect(eficaciaAmenaza(amenazaDeLaTabla(2), 0)).toBeCloseTo(0.5, 10);
    expect(eficaciaAmenaza(amenazaDeLaTabla(2), 0.05)).toBeCloseTo(0.55, 10);
    expect(eficaciaAmenaza(amenazaDeLaTabla(2), 0.1)).toBeCloseTo(0.6, 10);

    const bandas = [0, 0.05].map((delta) =>
      [4, 2, 1, 0].map(
        (n) => residualSobreInherente32(eficaciaAmenaza(amenazaDeLaTabla(n), delta) as number).banda,
      ),
    );
    expect(bandas[0]).toEqual(bandas[1]);
  });
});

describe('REQ-SIG-21 §4 · el presupuesto por clase, y su renormalización', () => {
  it('el presupuesto es 70 / 20 / 10', () => {
    expect(PRESUPUESTO_CLASE).toEqual({ principal: 0.7, secundario: 0.2, complementario: 0.1 });
  });

  it('la clase sale del catálogo: esPrincipal manda, y entre las otras dos manda el peso', () => {
    expect(claseDeControl(PRINCIPAL(3))).toBe('principal');
    expect(claseDeControl(SECUNDARIO(3))).toBe('secundario');
    expect(claseDeControl(COMPLEMENTARIO(3))).toBe('complementario');
  });

  it('sin complementarios, los pesos se renormalizan a 77.8 / 22.2', () => {
    // Criterio de aceptación 4: una clase vacía NO reparte su presupuesto entre las otras
    // como bonificación extra, pero tampoco deja un 10 % perdido. Repartir el huérfano
    // premiaría no clasificar.
    const d = desglosarEficaciaAmenaza([PRINCIPAL(2), SECUNDARIO(4), SECUNDARIO(4)]);
    const principal = d.clases.find((c) => c.clase === 'principal');
    const secundario = d.clases.find((c) => c.clase === 'secundario');

    expect(d.clases).toHaveLength(2);
    expect(principal?.presupuestoNominal).toBeCloseTo(0.7, 10);
    expect(principal?.presupuesto).toBeCloseTo(0.7778, 4);
    expect(secundario?.presupuestoNominal).toBeCloseTo(0.2, 10);
    expect(secundario?.presupuesto).toBeCloseTo(0.2222, 4);
    expect(principal!.presupuesto + secundario!.presupuesto).toBeCloseTo(1, 10);

    // 0.7778 × 0.5 + 0.2222 × 0.95 = 0.6000, recortado por el techo a 0.55.
    expect(d.bruta).toBeCloseTo(0.6, 4);
    expect(d.eficacia).toBeCloseTo(0.55, 10);
  });

  it('cada clase informa su media y su aporte, que es presupuesto × media', () => {
    const d = desglosarEficaciaAmenaza(amenazaDeLaTabla(4));
    expect(d.clases.map((c) => c.clase)).toEqual(['principal', 'secundario', 'complementario']);

    const [p, s, c] = d.clases;
    expect(p.controles).toBe(1);
    expect(p.media).toBeCloseTo(0.95, 10);
    expect(p.aporte).toBeCloseTo(0.665, 10);
    expect(s.controles).toBe(2);
    expect(s.media).toBeCloseTo(0.95, 10);
    expect(s.aporte).toBeCloseTo(0.19, 10);
    expect(c.controles).toBe(1);
    expect(c.media).toBeCloseTo(0.9, 10);
    expect(c.aporte).toBeCloseTo(0.09, 10);
    expect(p.aporte + s.aporte + c.aporte).toBeCloseTo(d.bruta as number, 10);
  });

  it('agregar controles de apoyo ya NO diluye al principal', () => {
    // El defecto de los pesos 3/2/1 normalizados por CANTIDAD: cuantos más acompañantes
    // tuviera la amenaza, menos pesaba el principal — así que la amenaza mejor mapeada era
    // la más difícil de marcar como descontrolada. Con presupuesto fijo, el principal
    // aporta el 70 % tenga tres controles o nueve.
    const conTres = desglosarEficaciaAmenaza([PRINCIPAL(0), SECUNDARIO(4), COMPLEMENTARIO(4)]);
    const conNueve = desglosarEficaciaAmenaza([
      PRINCIPAL(0),
      ...Array.from({ length: 4 }, () => SECUNDARIO(4)),
      ...Array.from({ length: 4 }, () => COMPLEMENTARIO(4)),
    ]);
    expect(conNueve.bruta).toBeCloseTo(conTres.bruta as number, 10);
    expect(conNueve.clases.find((c) => c.clase === 'principal')?.presupuesto).toBeCloseTo(0.7, 10);
  });
});

describe('REQ-SIG-21 §4 y §8 · exactamente un principal, y evaluado', () => {
  it('dos principales es un error de datos: la eficacia queda desconocida, no promediada', () => {
    const d = desglosarEficaciaAmenaza([PRINCIPAL(2), PRINCIPAL(4), SECUNDARIO(4)]);
    expect(d.eficacia).toBeNull();
    expect(d.error).toContain('más de un control Principal');
    // No se elige uno por orden de consulta: el techo quedaría definido por el azar del
    // `find`, y 0.55 y 0.95 no son el mismo riesgo.
    expect(d.clases).toHaveLength(0);
  });

  it('un principal sin nivel no aplasta la amenaza con un 5 % silencioso', () => {
    // La trampa latente de §8: excluirlo del promedio lo degradaría a v2 en silencio, y
    // dejarlo dentro pondría el techo en 0 + δ. Ninguna de las dos es honesta.
    const d = desglosarEficaciaAmenaza([PRINCIPAL(null), SECUNDARIO(4), COMPLEMENTARIO(4)]);
    expect(d.eficacia).toBeNull();
    expect(d.error).toContain('no tiene nivel de madurez declarado');
  });

  it('designar un principal se rechaza si la amenaza ya tiene otro', () => {
    const errores = validarDesignacionPrincipal({
      codigoAmenaza: 'A.11',
      codigoControl: 'A.8.5',
      nivelActual: 3,
      yaHayOtroPrincipal: true,
    });
    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain('exactamente uno');
  });

  it('designar un principal se rechaza si el control no tiene nivel declarado', () => {
    // Criterio de aceptación 5: rechazo con mensaje explícito, no un 5 % silencioso.
    const errores = validarDesignacionPrincipal({
      codigoAmenaza: 'I.1',
      codigoControl: 'A.7.2',
      nivelActual: null,
      yaHayOtroPrincipal: false,
    });
    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain('A.7.2');
    expect(errores[0]).toContain('Evaluá el control primero');
  });

  it('una designación válida no produce errores', () => {
    expect(
      validarDesignacionPrincipal({
        codigoAmenaza: 'A.24',
        codigoControl: 'A.8.14',
        nivelActual: 3,
        yaHayOtroPrincipal: false,
      }),
    ).toEqual([]);
  });
});

describe('REQ-SIG-21 §8 · «sin evaluar» no es L0', () => {
  it('los controles sin nivel quedan fuera del promedio y se cuentan aparte', () => {
    // Los siete físicos —A.7.1, A.7.2, A.7.3, A.7.4, A.7.6, A.7.11, A.7.12— entraban al
    // promedio como si fueran L0. No están evaluados: no es lo mismo «no existe» que «no
    // lo miramos». `metricasMadurez` ya los excluía; acá se hace lo mismo.
    const d = desglosarEficaciaAmenaza([
      COMPLEMENTARIO(3),
      COMPLEMENTARIO(3),
      COMPLEMENTARIO(null),
    ]);
    expect(d.evaluados).toBe(2);
    expect(d.sinEvaluar).toBe(1);
    expect(d.eficacia).toBeCloseTo(0.9, 10);
  });

  it('excluirlos SUBE la eficacia y BAJA el residual — el signo contrario al resto', () => {
    // Criterio de aceptación 7. Antes: (0.9 + 0.9 + 0) / 3 = 0.60. Ahora: 0.90.
    const antes = residualSobreInherente32(0.6).residual;
    const ahora = residualSobreInherente32(0.9).residual;
    expect(antes).toBeCloseTo(12.8, 10);
    expect(ahora).toBeCloseTo(3.2, 10);
    expect(ahora).toBeLessThan(antes);
  });

  it('si no queda ninguno evaluado, la eficacia es desconocida y el residual sin calcular', () => {
    // Criterio de aceptación 6. Desconocido no es cero — escribirlo como cero haría que la
    // matriz residual saliera idéntica a la inherente.
    const d = desglosarEficaciaAmenaza([COMPLEMENTARIO(null), COMPLEMENTARIO(null)]);
    expect(d.eficacia).toBeNull();
    expect(d.error).toBeNull();
    expect(d.sinEvaluar).toBe(2);
  });

  it('también con principal designado: si sólo el principal está evaluado, manda él solo', () => {
    const d = desglosarEficaciaAmenaza([PRINCIPAL(3), SECUNDARIO(null), COMPLEMENTARIO(null)]);
    expect(d.clases).toHaveLength(1);
    expect(d.clases[0].presupuesto).toBeCloseTo(1, 10);
    expect(d.bruta).toBeCloseTo(0.9, 10);
    expect(d.eficacia).toBeCloseTo(0.9, 10);
  });
});

describe('REQ-SIG-21 · el cambio es INERTE mientras no haya relevancias', () => {
  // Esta es la garantía que importa hoy: los 272 pares siguen con `relevanciaId` en null,
  // así que las 57 amenazas caen en esta rama y su residual no se mueve por este cambio.
  const sinRelevancia = (niveles: number[]): ControlAgregable[] =>
    niveles.map((nivel) => ({ nivel, peso: 1, esPrincipal: false }));

  it('sin principal designado se calcula con la media simple, MET-SIG-01 v2', () => {
    const d = desglosarEficaciaAmenaza(sinRelevancia([3, 3, 2, 4, 3, 3]));
    expect(d.regla).toBe('media-simple');
    expect(d.clases).toEqual([]);
    expect(d.techo).toBeNull();
    expect(d.techoActua).toBe(false);
    // Exactamente el AVERAGE del libro: (0.9+0.9+0.5+0.95+0.9+0.9) / 6.
    expect(d.eficacia).toBeCloseTo(5.05 / 6, 10);
  });

  it('el presupuesto 70/20/10 NO se aplica sin principal, aunque haya pesos distintos', () => {
    // Media clasificación es peor que ninguna (§6): una amenaza sin su principal designado
    // no sube a v3, se queda en la media ponderada por peso y la pantalla lo dice.
    const d = desglosarEficaciaAmenaza([SECUNDARIO(4), COMPLEMENTARIO(2)]);
    expect(d.regla).toBe('media-simple');
    // (2×0.95 + 1×0.5) / 3, no 0.20/0.10 renormalizados.
    expect(d.eficacia).toBeCloseTo((2 * 0.95 + 0.5) / 3, 10);
  });
});
