// lib/sgsi/__tests__/alcance-plan.test.ts
//
// Qué mitiga un plan de tratamiento: el control que mejora, las amenazas de la VALORACIÓN
// que ese control contiene como principal, y cuántos riesgos y activos alcanza.

import { alcanceDelPlan, type RiesgoDelAlcance } from '../alcance-plan';

const CONTROL = { codigo: 'A.8.14', nombre: 'Redundancia', nivel: 70, objetivo: 90 };

const r = (amenazaCodigo: string, amenazaNombre: string, activoCodigo: string): RiesgoDelAlcance => ({
  amenazaCodigo,
  amenazaNombre,
  activoCodigo,
});

describe('alcanceDelPlan', () => {
  it('agrupa los riesgos por amenaza y cuenta cuántos hay de cada una', () => {
    const a = alcanceDelPlan(CONTROL, [
      r('A.24', 'Denegación de servicio', 'TEC-SER-0001'),
      r('A.24', 'Denegación de servicio', 'TEC-SER-0002'),
      r('I.5', 'Avería de origen físico o lógico', 'TEC-SER-0001'),
    ]);
    expect(a.estado).toBe('contiene');
    expect(a.amenazas).toEqual([
      { codigo: 'A.24', nombre: 'Denegación de servicio', riesgos: 2, activos: 2 },
      { codigo: 'I.5', nombre: 'Avería de origen físico o lógico', riesgos: 1, activos: 1 },
    ]);
  });

  // La trampa. Si los activos se sumaran por amenaza, un plan sobre cuatro amenazas del
  // mismo servidor diría que alcanza cuatro activos y alcanza uno. La cifra que un comité
  // lee —«a cuántos activos llega este plan»— quedaría inflada por construcción.
  it('un activo alcanzado por dos amenazas cuenta UNA vez en el total', () => {
    const a = alcanceDelPlan(CONTROL, [
      r('A.24', 'Denegación de servicio', 'TEC-SER-0001'),
      r('I.5', 'Avería', 'TEC-SER-0001'),
      r('I.6', 'Corte eléctrico', 'TEC-SER-0001'),
    ]);
    expect(a.riesgos).toBe(3);
    expect(a.activos).toBe(1);
    // Por amenaza sí es uno cada una: ahí no hay nada que deduplicar.
    expect(a.amenazas.map((x) => x.activos)).toEqual([1, 1, 1]);
  });

  it('ordena por riesgos descendente, con el código como desempate', () => {
    const a = alcanceDelPlan(CONTROL, [
      r('I.8', 'Fallo de comunicaciones', 'A-1'),
      r('A.24', 'Denegación de servicio', 'A-1'),
      r('A.24', 'Denegación de servicio', 'A-2'),
      r('I.6', 'Corte eléctrico', 'A-3'),
    ]);
    expect(a.amenazas.map((x) => x.codigo)).toEqual(['A.24', 'I.6', 'I.8']);
  });

  it('sin control el plan no mitiga por esta vía, y se dice por qué', () => {
    // Un TRANSFERIR o un ACEPTAR no mejora ningún control: no tiene madurez que mover ni
    // amenazas que contener. Es un estado distinto de «tiene control y no contiene nada».
    const a = alcanceDelPlan(null, []);
    expect(a.estado).toBe('sin-control');
    expect(a.amenazas).toEqual([]);
    expect(a.brecha).toBeNull();
  });

  it('un control que no es principal de ninguna amenaza de la valoración lo dice', () => {
    // Medido sobre el registro real: 10 de los 18 planes vigentes están en este caso. El
    // plan eleva la madurez del control, pero no cierra ninguna brecha del registro. Callarlo
    // sería dejar que el tablero afirme una cobertura que no existe.
    const a = alcanceDelPlan(CONTROL, []);
    expect(a.estado).toBe('sin-amenazas');
    expect(a.riesgos).toBe(0);
    expect(a.activos).toBe(0);
  });

  it('la brecha es lo que le falta al control para llegar a su objetivo', () => {
    expect(alcanceDelPlan(CONTROL, []).brecha).toBe(20);
  });

  it('un control sin nivel evaluado no tiene brecha calculable, y eso no es cero', () => {
    // Cero diría «ya cumple». Sin evaluar es que nadie miró, que es lo contrario.
    const a = alcanceDelPlan({ ...CONTROL, nivel: null }, []);
    expect(a.brecha).toBeNull();
  });

  it('un control que ya alcanzó su objetivo no reporta brecha negativa', () => {
    const a = alcanceDelPlan({ ...CONTROL, nivel: 90 }, []);
    expect(a.brecha).toBe(0);
  });
});


// ── LOS ACTIVOS QUE ESTE PLAN ESTÁ TRATANDO ────────────────────────────────────────────
//
// El bloque «Qué mitiga» decía «6 activos» y no cuáles. Quien aprueba un plan necesita los
// nombres: «6» no se lleva a un comité, y el número solo no deja comprobar nada.
//
// SÓLO LOS DE RESIDUAL ALTO O CRÍTICO, que es lo que se pidió. Un plan toca decenas de
// riesgos tranquilos; listarlos todos enterraría los que importan. La banda se corta en 5,
// igual que `umbral_riesgo`.
//
// MEDIDO ANTES DE CONSTRUIRLO: de los 25 planes activos, **sólo 3** tratan algún riesgo Alto
// o Crítico por su control principal —A.8.14 con 8 activos, A.8.6 con 6, A.6.3 con 3—. Los
// otros 22 mostrarán la sección vacía, y eso es un hallazgo, no un hueco.


const CONTROL_ALARMANTES = { codigo: 'A.8.14', nombre: 'Seguridad en el desarrollo', nivel: 70, objetivo: 90 };

const rAlarm = (activoCodigo: string, activoNombre: string, residual: string | null, amenaza = 'I.5') => ({
  amenazaCodigo: amenaza,
  amenazaNombre: `Amenaza ${amenaza}`,
  activoCodigo,
  activoNombre,
  residual,
});

describe('los activos alarmantes que trata el plan', () => {
  it('lista sólo los de residual Alto o Crítico, con su nombre', () => {
    const a = alcanceDelPlan(CONTROL_ALARMANTES, [
      rAlarm('FIN-APP-0001', 'Siigo', '6.48'),
      rAlarm('PRO-APP-0002', 'Verify', '0.50'),
    ]);
    expect(a.activosAlarmantes.map((x) => x.codigo)).toEqual(['FIN-APP-0001']);
    expect(a.activosAlarmantes[0].nombre).toBe('Siigo');
  });

  it('un activo con dos amenazas altas aparece UNA vez, con el conteo', () => {
    const a = alcanceDelPlan(CONTROL_ALARMANTES, [
      rAlarm('FIN-APP-0001', 'Siigo', '6.48', 'I.5'),
      rAlarm('FIN-APP-0001', 'Siigo', '5.50', 'E.1'),
    ]);
    expect(a.activosAlarmantes).toHaveLength(1);
    expect(a.activosAlarmantes[0].riesgos).toBe(2);
  });

  it('el residual sin calcular no se cuenta como alto', () => {
    // El control: `null` no es cero ni es alto, es «no se sabe». Contarlo como alto inflaria
    // la lista que alguien va a llevar a un comite.
    const a = alcanceDelPlan(CONTROL_ALARMANTES, [rAlarm('X-1', 'Equis', null)]);
    expect(a.activosAlarmantes).toHaveLength(0);
  });

  it('un plan sin control no trata ningun activo', () => {
    expect(alcanceDelPlan(null, []).activosAlarmantes).toEqual([]);
  });

  it('salen ordenados por cuantos riesgos altos traen', () => {
    const a = alcanceDelPlan(CONTROL_ALARMANTES, [
      rAlarm('UNO', 'Uno', '6.48', 'I.5'),
      rAlarm('DOS', 'Dos', '6.48', 'I.5'),
      rAlarm('DOS', 'Dos', '5.50', 'E.1'),
    ]);
    expect(a.activosAlarmantes.map((x) => x.codigo)).toEqual(['DOS', 'UNO']);
  });
});
