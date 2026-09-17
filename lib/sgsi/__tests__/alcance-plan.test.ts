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
