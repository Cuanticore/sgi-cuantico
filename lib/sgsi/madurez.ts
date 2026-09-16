// lib/sgsi/madurez.ts
//
// Maturity arithmetic, per MET-SIG-01 v3 section 8.2. Pure on purpose: no Prisma, no
// I/O, no framework. The Controles screen recomputes the whole dashboard client-side
// while the user drags maturity selects, and the seed verifies the same numbers
// server-side, so both must call one implementation.
//
// THE RULE THAT IS EASY TO GET WRONG
//
// The maturity index is the mean of EFFICACY, not the mean of the level. Efficacy is a
// ratio scale and can be averaged; the L0-L5 level is ordinal and averaging it is
// incorrect in rigour. Efficacy is also what feeds residual risk, so maturity and risk
// speak the same language. The mean LEVEL is kept only as a comparison between periods,
// never as "the organisation's maturity": an L5 offsetting an L0 hides exactly what
// needs managing.

// ---------------------------------------------------------------------------------------
// LA ESCALA (REQ-SIG-24 §3)
// ---------------------------------------------------------------------------------------
//
// Once escalones de 0 a 100, de diez en diez. La eficacia ES el número: no hay curva que
// interpretar. La escala anterior —L0-L5 con la curva PILAR— tenía UN SOLO VALOR entre el
// 30 % y el 90 %, que es el tramo donde el residual cambia de banda, y tres escalones
// apiñados en el techo, donde ya no cambia nada. Ese agujero es la razón por la que un
// control «definido pero sin prueba» tenía que elegir entre 50 % y 90 %.

/// La curva PILAR/CCN-CERT que rigió hasta REQ-SIG-24. Se conserva EXPORTADA por dos
/// motivos concretos, no por nostalgia: la migración la necesita para traducir por
/// eficacia (L3→90, L4→90), y la línea base del GAP del 2 de marzo de 2026 está expresada
/// en ella. No la use ningún camino de cálculo.
export const EFICACIA_CMM_HISTORICA = [0, 0.1, 0.5, 0.9, 0.95, 1] as const;

/// Los once escalones válidos. El 100 existe en el catálogo por completitud de la escala;
/// la interfaz no lo ofrece (§3) y el motor lo acota en 0.95 (`EFICACIA_MAXIMA`).
export const ESCALONES = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;

/// `nivel → eficacia`, tal como la trae `EscalaMadurez`. La proyección del catálogo, no
/// una copia de la curva: es lo que permite que editar un escalón no sea recompilar.
export type TablaEficacia = ReadonlyMap<number, number>;

/// REQ-SIG-24 §3 · LA RÚBRICA. El descriptor de cada escalón, y es el requerimiento, no un
/// anexo: un porcentaje sin ancla se elige por sensación, y la sensación fue la que llevó
/// el índice del 5.1 % al 86.6 % en un ciclo.
///
/// LA REGLA DE ORO PARA CALIFICAR: *el escalón intermedio es «el nivel de abajo, con la
/// evidencia que falta»*. `A.8.14 Redundancia` con evidencia «redundancia en AWS, sin
/// prueba formal de conmutación» no es 90 %: es 70 %, y el sistema lo dice solo.
///
/// Vive acá y no en cada pantalla porque tres componentes la mostraban con su propia copia
/// de la escala —`PantallaControl`, `PopupControl` y `ControlesMadurez`— y tres copias de
/// una tabla de criterio es como la segunda queda desactualizada sin que nada falle.
///
/// `seleccionable: false` en el 100 % es el §3 del requerimiento: la eficacia 1.0 daría
/// residual exactamente 0 y el riesgo desaparecería del registro. El escalón existe en el
/// catálogo por completitud de la escala; la interfaz no lo ofrece.
export interface EscalonRubrica {
  nivel: number;
  nombre: string;
  seleccionable: boolean;
  /// El nivel CMM al que equivale, cuando equivale a alguno. Sirve para leer la línea base
  /// del GAP del 2 de marzo de 2026, que está expresada en la escala vieja.
  equivaleA: string | null;
}

export const RUBRICA: readonly EscalonRubrica[] = [
  { nivel: 0, nombre: 'No existe. Nadie lo hace.', seleccionable: true, equivaleA: 'L0' },
  {
    nivel: 10,
    nombre: 'Reactivo: se hace cuando algo pasa, sin método ni constancia.',
    seleccionable: true,
    equivaleA: 'L1',
  },
  {
    nivel: 20,
    nombre: 'Se hace por iniciativa de una persona; se cae si esa persona falta.',
    seleccionable: true,
    equivaleA: null,
  },
  {
    nivel: 30,
    nombre: 'Práctica reconocible y repetida, no escrita.',
    seleccionable: true,
    equivaleA: null,
  },
  {
    nivel: 40,
    nombre: 'Escrita parcialmente; se aplica de forma desigual entre casos o áreas.',
    seleccionable: true,
    equivaleA: null,
  },
  {
    nivel: 50,
    nombre: 'Documentada y repetible; sin evidencia de que se aplique siempre.',
    seleccionable: true,
    equivaleA: 'L2',
  },
  {
    nivel: 60,
    nombre: 'Documentada, comunicada y aplicada; el registro es incompleto.',
    seleccionable: true,
    equivaleA: null,
  },
  {
    nivel: 70,
    nombre: 'Documentada, comunicada, aplicada y registrada. Sin medición ni prueba.',
    seleccionable: true,
    equivaleA: 'L3',
  },
  {
    nivel: 80,
    nombre: 'Con una medición o una prueba ejecutada y registrada; los resultados no se revisan.',
    seleccionable: true,
    equivaleA: null,
  },
  {
    nivel: 90,
    nombre: 'Medido, revisado periódicamente, y las desviaciones se corrigen.',
    seleccionable: true,
    equivaleA: 'L4',
  },
  {
    nivel: 100,
    nombre: 'Reservado. Ningún control elimina un riesgo.',
    seleccionable: false,
    equivaleA: 'L5',
  },
];

/// Los escalones que la interfaz ofrece — la rúbrica menos el 100 % (§3, criterio 3).
export const ESCALONES_SELECCIONABLES: readonly EscalonRubrica[] = RUBRICA.filter(
  (e) => e.seleccionable,
);

/// El descriptor de un escalón, para etiquetas. Nunca inventa: un escalón que no está en la
/// rúbrica devuelve null y quien llama decide cómo decir «desconocido».
export function descriptorDeNivel(nivel: number | null): string | null {
  if (nivel === null) return null;
  return RUBRICA.find((e) => e.nivel === nivel)?.nombre ?? null;
}

/// El escalón desde el cual un control cuenta como GESTIONADO. Equivale al viejo «L3+»:
/// documentado, comunicado, aplicado y registrado.
export const UMBRAL_GESTIONADO = 70;

/// Hasta acá, el control es una BRECHA concreta con dueño y fecha. Equivale al viejo
/// «L2 o menos».
export const UMBRAL_BRECHA = 50;

/// La eficacia de un escalón.
///
/// Con `tabla`, manda el catálogo — es el camino que usan `generarRiesgos` y la Ecuación,
/// y el que hace que editar un escalón no sea recompilar (§8.1).
///
/// Sin `tabla`, cae en la identidad `nivel / 100`, que es válida porque la escala sembrada
/// es lineal y la siembra lo verifica. Es el camino de las PANTALLAS, que formatean
/// etiquetas sin tener el catálogo a mano. El día que la escala deje de ser lineal, la
/// siembra falla y hay que pasar la tabla también acá.
///
/// UN ESCALÓN DESCONOCIDO ES UN DATO ROTO, NO UN CERO. La versión anterior devolvía 0 para
/// cualquier nivel fuera de 0..5, y por eso un nivel de la escala vieja sobrevivido a la
/// migración habría bajado la eficacia en silencio en vez de avisar. `null` sigue siendo
/// 0 porque los llamadores ya filtran los no evaluados antes de llegar acá — «sin evaluar»
/// nunca entra a una media.
export function eficaciaDeNivel(nivel: number | null, tabla?: TablaEficacia): number {
  if (nivel === null) return 0;

  if (tabla !== undefined) {
    const e = tabla.get(nivel);
    if (e === undefined) {
      throw new Error(
        `eficaciaDeNivel: el escalón ${nivel} no está en el catálogo de madurez. ` +
          'Un escalón que la tabla no trae es un dato roto, no una eficacia de cero.',
      );
    }
    return e;
  }

  if (!Number.isInteger(nivel) || nivel < 0 || nivel > 100 || nivel % 10 !== 0) {
    throw new Error(
      `eficaciaDeNivel: ${nivel} no es un escalón de la escala (0 a 100, de diez en diez). ` +
        'Si viene de la escala vieja L0-L5, la migración de REQ-SIG-24 no lo alcanzó.',
    );
  }
  return nivel / 100;
}

export function media(valores: readonly number[]): number {
  if (valores.length === 0) return 0;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

/// The correct statistic for an ordinal scale, and it resists extremes.
export function mediana(valores: readonly number[]): number {
  if (valores.length === 0) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 === 0 ? (orden[medio - 1] + orden[medio]) / 2 : orden[medio];
}

export type EstadoSoa = 'si' | 'parcial' | 'no';

/// SOA derivation per ISO 27001 6.1.3 d. «Aplica con alcance adaptado» is NOT an
/// exclusion: the control covers the scope through the remote operating model (the
/// seven physical controls of DEC-SIG-01 6.3), and it counts in every indicator. Only
/// «No aplica» excludes.
export function esAplicable(soa: EstadoSoa): boolean {
  return soa !== 'no';
}

/// Human label for the SOA state, used in the bitácora and the export.
export function etiquetaSoa(soa: EstadoSoa): string {
  return soa === 'no' ? 'No aplica' : soa === 'parcial' ? 'Aplica con alcance adaptado' : 'Aplica';
}

/// Pure validation of a SOA change, shared by the action and the UI so both refuse the
/// same inputs. Returns error messages, empty when valid. Rule 6.1.3 d: NO and PARCIAL
/// require a written justification an auditor can review.
export function validarNuevoSoa(soa: EstadoSoa, justificacion: string): string[] {
  const errores: string[] = [];
  const j = justificacion.trim();
  if ((soa === 'no' || soa === 'parcial') && j.length === 0) {
    errores.push(
      soa === 'no'
        ? '«No aplica» exige justificación escrita: es la declaración de exclusión que el auditor revé.'
        : '«Aplica con alcance adaptado» exige justificación escrita: cómo se alcanza el objetivo en el modelo de operación remota.',
    );
  }
  return errores;
}

/// Rule 2: a control whose scope coverage is partial rarely sustains the top rung in an
/// audit. Only an advertencia, not a rejection — the warning is shown to the author, who
/// decides.
export function advertenciaParcialNivelAlto(actual: number | null): boolean {
  return actual !== null && actual >= 90;
}

export interface ControlMadurez {
  soa: EstadoSoa;
  lineaBase: number | null;
  actual: number | null;
  objetivo: number | null;
}

export interface MetricasMadurez {
  total: number;
  aplicables: number;
  parciales: number;
  noAplicables: number;
  /// Mean of efficacy, as a percentage. The headline metric.
  indice: number;
  /// Median of the rung, in points.
  nivelTipico: number;
  /// Mean of the rung. REFERENCE ONLY — never report this as "the maturity".
  nivelMedio: number;
  /// Controls at `UMBRAL_GESTIONADO` (70 %) or above — el viejo «L3+».
  enGestionado: number;
  pctGestionado: number;
  enObjetivo: number;
  brechas: number;
  avanceMedio: number;
  brechaTotal: number;
  /// Applicable controls whose baseline is the GAP of 2 mar 2026. A.7.13 is declared
  /// applicable but was never evaluated by the GAP, so it is absent here (92 of 93).
  conLineaBase: number;
}

export function metricasMadurez(
  controles: readonly ControlMadurez[],
  tabla?: TablaEficacia,
): MetricasMadurez {
  const aplicables = controles.filter((c) => esAplicable(c.soa));
  const parciales = aplicables.filter((c) => c.soa === 'parcial').length;
  // A non-applicable control is excluded from every average. Letting a single zero in
  // is the defect the applicability flag exists to prevent.
  //
  // So is an applicable control that nobody has scored yet: «Sin evaluar» (A.7.13)
  // and «Por evaluar» (los siete de alcance adaptado) are pending judgments, not L0s.
  // Feeding zero would write a decision that was never made into every mean.
  const evaluados = aplicables.filter((c) => c.actual !== null);
  const niveles = evaluados.map((c) => c.actual as number);

  const enGestionado = evaluados.filter(
    (c) => (c.actual as number) >= UMBRAL_GESTIONADO,
  ).length;
  const enObjetivo = evaluados.filter(
    (c) => c.objetivo !== null && (c.actual as number) >= c.objetivo,
  ).length;
  // Gaps are never aggregated into a decimal: a control at 10 % is a concrete action
  // with an owner and a date. This counts them, it does not average them.
  const brechas = evaluados.filter((c) => (c.actual as number) <= UMBRAL_BRECHA).length;
  const brechaTotal = evaluados.reduce(
    (suma, c) => suma + Math.max(0, (c.objetivo ?? 0) - (c.actual as number)),
    0,
  );
  const avances = aplicables
    .filter((c) => c.lineaBase !== null && c.actual !== null)
    .map((c) => (c.actual as number) - (c.lineaBase as number));

  return {
    total: controles.length,
    aplicables: aplicables.length,
    parciales,
    noAplicables: controles.length - aplicables.length,
    indice: media(evaluados.map((c) => eficaciaDeNivel(c.actual, tabla))) * 100,
    nivelTipico: mediana(niveles),
    nivelMedio: media(niveles),
    enGestionado,
    pctGestionado: evaluados.length === 0 ? 0 : (enGestionado / evaluados.length) * 100,
    enObjetivo,
    brechas,
    avanceMedio: media(avances),
    brechaTotal,
    conLineaBase: aplicables.filter((c) => c.lineaBase !== null).length,
  };
}

// ---------------------------------------------------------------------------------------
// EFICACIA AGREGADA POR AMENAZA (MET-SIG-01 §7.4 · REQ-SIG-21)
// ---------------------------------------------------------------------------------------

/// Un control mitigando una amenaza, con lo único que la agregación necesita: su nivel de
/// madurez actual, el peso del catálogo `RelevanciaControl` (3/2/1) y si es el principal.
export interface ControlAgregable {
  nivel: number | null;
  peso: number;
  esPrincipal: boolean;
}

/// Las tres clases de relevancia de §7.4, en el orden en que reparten presupuesto.
/// El catálogo las nombra Principal / Complementario / De apoyo (pesos 3 / 2 / 1);
/// acá se las identifica por su papel en la fórmula, no por su etiqueta.
export type ClaseRelevancia = 'principal' | 'secundario' | 'complementario';

export const CLASES_RELEVANCIA: readonly ClaseRelevancia[] = [
  'principal',
  'secundario',
  'complementario',
];

/// Presupuesto fijo por clase (REQ-SIG-21 §4). Reemplaza a la normalización por CANTIDAD
/// de controles: con pesos 3/2/1 normalizados por cantidad, agregar controles de apoyo
/// diluía al principal, así que una amenaza bien documentada era la más difícil de marcar
/// como descontrolada. Con presupuesto fijo el principal aporta siempre el 70 %, tenga la
/// amenaza tres controles o nueve.
export const PRESUPUESTO_CLASE: Readonly<Record<ClaseRelevancia, number>> = {
  principal: 0.7,
  secundario: 0.2,
  complementario: 0.1,
};

/// La clase sale del catálogo, no de una lista de nombres: `esPrincipal` es la marca que
/// `RelevanciaControl` ya declara, y entre las otras dos manda el peso (Complementario 2,
/// De apoyo 1). Así el día que el catálogo cambie de nombres la fórmula sigue en pie.
export function claseDeControl(control: ControlAgregable): ClaseRelevancia {
  if (control.esPrincipal) return 'principal';
  return control.peso >= 2 ? 'secundario' : 'complementario';
}

/// Lo que una clase aportó a la eficacia bruta. `presupuesto` es el nominal renormalizado
/// sobre las clases PRESENTES: una amenaza sin complementarios reparte 77.8 / 22.2, no
/// 70 / 20 dejando un 10 % perdido. Repartir el presupuesto huérfano entre las otras
/// premiaría no clasificar.
export interface AporteClase {
  clase: ClaseRelevancia;
  presupuestoNominal: number;
  presupuesto: number;
  controles: number;
  /// Media de eficacia DENTRO de la clase.
  media: number;
  /// presupuesto × media.
  aporte: number;
}

/// Con qué regla se calculó la eficacia de la amenaza. `ponderada-acotada` es MET-SIG-01
/// v3 §7.4; `media-simple` es la v2 que la v3 reemplaza y que sigue operando mientras la
/// amenaza no tenga principal designado.
export type ReglaEficacia = 'ponderada-acotada' | 'media-simple';

export interface DesgloseEficaciaAmenaza {
  regla: ReglaEficacia;
  /// Una fila por clase presente, en orden principal → secundario → complementario.
  /// Vacío en la regla `media-simple`: ahí no hay clases que desglosar.
  clases: AporteClase[];
  /// La media antes del techo. Null cuando la eficacia es desconocida.
  bruta: number | null;
  /// e(principal) + δ. Null cuando no hay principal designado.
  techo: number | null;
  /// True solo cuando el techo efectivamente recortó la bruta — el momento en que la
  /// regla gana su sueldo.
  techoActua: boolean;
  /// El resultado. Null cuando es DESCONOCIDA: sin controles, sin controles evaluados, o
  /// con un error de datos que haría ambiguo el techo. Desconocida nunca es cero.
  eficacia: number | null;
  /// Controles con nivel declarado, los únicos que entran a la media.
  evaluados: number;
  /// Controles mapeados que nadie evaluó todavía. Quedan FUERA de la media.
  sinEvaluar: number;
  /// Por qué la eficacia quedó desconocida pese a haber controles, en castellano y para
  /// mostrar. Null cuando no hay error de datos.
  error: string | null;
}

/// Eficacia agregada de los controles que mitigan una amenaza, MET-SIG-01 §7.4 con los
/// presupuestos de REQ-SIG-21 §4:
///
///     e_bruta(t) = 0.70·media(principal) + 0.20·media(secundarios) + 0.10·media(complementarios)
///     e(t)       = MIN( e_bruta , e_principal + δ )
///
/// EL TECHO NO ES OPCIONAL, y esta es la razón escrita. Los presupuestos por clase meten
/// un PISO INCONDICIONAL del 30 %: con el principal en L0 —el control no existe— la bruta
/// todavía lee 28 %, porque las otras dos clases aportan su presupuesto pase lo que pase.
/// Sin el techo, 70/20/10 reintroduce por otra puerta el mismo enmascaramiento que la
/// media simple producía. Con techo, ese mismo caso da 5 % y el residual vuelve a rozar el
/// inherente, que es la verdad. El techo solo actúa cuando el principal está débil; cuando
/// está fuerte no interviene.
///
/// SIN PRINCIPAL DESIGNADO NO HAY REGLA v3. La amenaza cae a la media ponderada por peso
/// sin techo —MET-SIG-01 v2, la media simple mientras todos los pesos valgan 1— y la
/// pantalla lo dice. Esa rama es la que hoy calcula las 57 amenazas: los 272 pares de
/// `ControlAmenaza` siguen con `relevanciaId` en null, así que este módulo entrega los
/// mismos números que antes hasta que alguien asigne la primera relevancia.
///
/// «SIN EVALUAR» NO ES L0 (§8). Un control aplicable que nadie puntuó es un juicio
/// pendiente, no un cero: `metricasMadurez` ya lo excluye de sus promedios y acá se hace
/// lo mismo. Meterlo como cero escribiría en cada media una decisión que nunca se tomó.
/// Si al excluirlos la amenaza se queda sin controles evaluados, su eficacia es null y el
/// residual queda «sin calcular» — el estado honesto.
///
/// La composición probabilística —uno menos el producto de los complementos— está
/// expresamente descartada: cuatro controles en L3 arrojarían 99,995 %. La eficacia
/// MAGERIT no es una probabilidad independiente de bloqueo sino un grado de calidad de
/// implantación, y los controles que opera la misma organización comparten modos de fallo.
/// La tolerancia del techo: cuánto puede la media superar al principal antes de que el
/// techo la recorte. Era 0.05 —medio nivel en la curva CMM, donde L3 y L4 distaban cinco
/// puntos—. En la escala nueva la unidad es el escalón, así que pasa a **0.10**: un
/// escalón. Mantenerla en 0.05 habría hecho el techo el doble de duro sin que nadie lo
/// decidiera, sólo porque cambió la escala debajo.
export const DELTA_TECHO = 0.1;

export function desglosarEficaciaAmenaza(
  controles: readonly ControlAgregable[],
  delta = DELTA_TECHO,
  tabla?: TablaEficacia,
): DesgloseEficaciaAmenaza {
  const sinEvaluar = controles.filter((c) => c.nivel === null).length;
  const evaluados = controles.filter((c) => c.nivel !== null);

  const vacio = {
    clases: [] as AporteClase[],
    bruta: null,
    techo: null,
    techoActua: false,
    eficacia: null,
    evaluados: evaluados.length,
    sinEvaluar,
  };

  // Un principal sin nivel no puede degradar la amenaza a v2 en silencio: su techo sería
  // 0 + δ = 5 % y aplastaría la eficacia entera por un dato que nadie cargó. Se declara
  // desconocida, y designarlo se rechaza antes (`validarDesignacionPrincipal`).
  const principalesDeclarados = controles.filter((c) => c.esPrincipal);
  if (principalesDeclarados.length > 1) {
    return {
      ...vacio,
      regla: 'ponderada-acotada',
      error:
        'La amenaza tiene más de un control Principal designado: el techo de §7.4 quedaría ' +
        'definido por el que la consulta devuelva primero. Es un error de datos, no un caso ' +
        'a promediar.',
    };
  }
  const principal = principalesDeclarados[0] ?? null;
  if (principal && principal.nivel === null) {
    return {
      ...vacio,
      regla: 'ponderada-acotada',
      error:
        'El control Principal de la amenaza no tiene nivel de madurez declarado: su techo ' +
        'sería 0 + δ y aplastaría la eficacia con una evaluación que nunca se hizo.',
    };
  }

  if (evaluados.length === 0) {
    return { ...vacio, regla: principal ? 'ponderada-acotada' : 'media-simple', error: null };
  }

  // ---- Rama v2: sin principal designado, media ponderada por peso y sin techo. -------
  // Es la fórmula anterior, intacta: mientras los 272 pares sigan sin relevancia todos
  // los pesos valen 1 y esto es exactamente el AVERAGE del libro.
  if (!principal) {
    const sumaPesos = evaluados.reduce((a, c) => a + c.peso, 0);
    if (sumaPesos === 0) return { ...vacio, regla: 'media-simple', error: null };
    const ponderada =
      evaluados.reduce((a, c) => a + c.peso * eficaciaDeNivel(c.nivel, tabla), 0) / sumaPesos;
    return {
      regla: 'media-simple',
      clases: [],
      bruta: ponderada,
      techo: null,
      techoActua: false,
      eficacia: ponderada,
      evaluados: evaluados.length,
      sinEvaluar,
      error: null,
    };
  }

  // ---- Rama v3: media DENTRO de cada clase, después combinación por presupuesto. -----
  const presentes = CLASES_RELEVANCIA.map((clase) => ({
    clase,
    miembros: evaluados.filter((c) => claseDeControl(c) === clase),
  })).filter((g) => g.miembros.length > 0);

  const presupuestoTotal = presentes.reduce((a, g) => a + PRESUPUESTO_CLASE[g.clase], 0);

  const clases: AporteClase[] = presentes.map((g) => {
    const presupuesto = PRESUPUESTO_CLASE[g.clase] / presupuestoTotal;
    const mediaClase = media(g.miembros.map((c) => eficaciaDeNivel(c.nivel, tabla)));
    return {
      clase: g.clase,
      presupuestoNominal: PRESUPUESTO_CLASE[g.clase],
      presupuesto,
      controles: g.miembros.length,
      media: mediaClase,
      aporte: presupuesto * mediaClase,
    };
  });

  const bruta = clases.reduce((a, c) => a + c.aporte, 0);

  // El techo, tal cual estaba: MIN( bruta , e(principal) + δ ).
  const techo = eficaciaDeNivel(principal.nivel, tabla) + delta;
  const eficacia = Math.min(bruta, techo);

  return {
    regla: 'ponderada-acotada',
    clases,
    bruta,
    techo,
    techoActua: eficacia < bruta,
    eficacia,
    evaluados: evaluados.length,
    sinEvaluar,
    error: null,
  };
}

/// La eficacia sola, para quien no necesita el desglose. Null es DESCONOCIDA, nunca cero:
/// sin controles mapeados, sin ninguno evaluado, o con un error de datos que haría ambiguo
/// el techo. Escribir cero haría que toda matriz residual saliera idéntica a la inherente.
export function eficaciaAmenaza(
  controles: readonly ControlAgregable[],
  delta = DELTA_TECHO,
  tabla?: TablaEficacia,
): number | null {
  return desglosarEficaciaAmenaza(controles, delta, tabla).eficacia;
}

/// Validación pura de designar un control como Principal de una amenaza (§4 y §8).
/// Devuelve los mensajes de error; vacío cuando la designación es válida. La comparte la
/// acción del servidor para que el rechazo y su motivo sean el mismo en los dos caminos
/// de alta —asociar con relevancia y cambiar la relevancia de un par existente—.
export function validarDesignacionPrincipal(entrada: {
  codigoAmenaza: string;
  codigoControl: string;
  /// Nivel de madurez actual del control que se quiere designar.
  nivelActual: number | null;
  /// Si la amenaza ya tiene OTRO control Principal.
  yaHayOtroPrincipal: boolean;
}): string[] {
  const errores: string[] = [];
  if (entrada.yaHayOtroPrincipal) {
    errores.push(
      `${entrada.codigoAmenaza} ya tiene un control Principal, y cada amenaza tiene ` +
        'exactamente uno. Pasá el actual a Complementario antes de nombrar otro.',
    );
  }
  if (entrada.nivelActual === null) {
    errores.push(
      `${entrada.codigoControl} no tiene nivel de madurez declarado, así que no puede ser ` +
        `el Principal de ${entrada.codigoAmenaza}: el techo de §7.4 quedaría en 0 + δ y ` +
        'aplastaría la eficacia de la amenaza entera con una evaluación que nunca se hizo. ' +
        'Evaluá el control primero.',
    );
  }
  return errores;
}
