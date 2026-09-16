// lib/sgsi/__tests__/codigo-activo.test.ts
//
// Reemitir el código de un activo que cambió de proceso. Lo que se prueba acá es lo que
// decide si el sistema pierde o no la historia del activo al hacerlo.

import {
  codigoDebeReemitirse,
  consecutivoDe,
  siguienteConsecutivo,
  formatearCodigoActivo,
  reemplazarActivoEnOrigen,
} from '../codigo-activo';
import { formatearOrigen, origenCubreRiesgo, parsearOrigen } from '../origen-plan';

describe('cuándo se reemite el código', () => {
  it('cambiar de proceso a uno con otro prefijo lo reemite', () => {
    expect(
      codigoDebeReemitirse(
        { prefijoArea: 'TEC', abreviaturaTipo: 'DAT' },
        { prefijoArea: 'EST', abreviaturaTipo: 'DAT' },
      ),
    ).toBe(true);
  });

  it('cambiar de tipo MAGERIT también lo reemite: la abreviatura es parte de lo que dice', () => {
    expect(
      codigoDebeReemitirse(
        { prefijoArea: 'TEC', abreviaturaTipo: 'DAT' },
        { prefijoArea: 'TEC', abreviaturaTipo: 'EQU' },
      ),
    ).toBe(true);
  });

  it('dos procesos distintos que comparten prefijo NO lo reemiten', () => {
    // El código diría exactamente lo mismo, así que reemitirlo solo gastaría un
    // consecutivo para llegar al mismo lugar.
    expect(
      codigoDebeReemitirse(
        { prefijoArea: 'TEC', abreviaturaTipo: 'DAT' },
        { prefijoArea: 'TEC', abreviaturaTipo: 'DAT' },
      ),
    ).toBe(false);
  });
});

describe('formatearCodigoActivo', () => {
  it('rellena el consecutivo a cuatro dígitos', () => {
    expect(formatearCodigoActivo({ prefijoArea: 'EST', abreviaturaTipo: 'DAT' }, 9)).toBe(
      'EST-DAT-0009',
    );
  });

  it('un consecutivo de cuatro cifras no se recorta', () => {
    expect(formatearCodigoActivo({ prefijoArea: 'TEC', abreviaturaTipo: 'EQU' }, 1234)).toBe(
      'TEC-EQU-1234',
    );
  });
});

// ===========================================================================
// El origen de los planes — lo único que ata por texto y no por id
// ===========================================================================
//
// Sin esto, reemitir un código haría que todos los planes del activo dejaran de cubrir sus
// riesgos en el mismo instante: `origenCubreRiesgo` compara por código, y el activo
// aparecería «sin plan» con el reloj de la deuda arrancando de cero.

const ORIGEN = formatearOrigen(
  'R-0123',
  'TEC-DAT-0009',
  'A.24',
  'Residual crítico de TEC-DAT-0009 — Denegación de servicio.',
);

describe('reemplazarActivoEnOrigen', () => {
  it('reapunta el origen al código nuevo y el plan sigue cubriendo el mismo riesgo', () => {
    const nuevo = reemplazarActivoEnOrigen(ORIGEN, 'TEC-DAT-0009', 'EST-DAT-0031');
    expect(nuevo).not.toBeNull();

    const partes = parsearOrigen(nuevo!);
    expect(partes).not.toBeNull();
    expect(partes!.activoCodigo).toBe('EST-DAT-0031');

    // Lo que importa: el plan sigue cubriendo el riesgo después de la mudanza.
    expect(
      origenCubreRiesgo(partes!, { activoCodigo: 'EST-DAT-0031', amenazaCodigo: 'A.24' }),
    ).toBe(true);
  });

  it('conserva el riesgo, la amenaza y la narrativa humana', () => {
    const partes = parsearOrigen(reemplazarActivoEnOrigen(ORIGEN, 'TEC-DAT-0009', 'EST-DAT-0031')!);
    expect(partes!.riesgoCodigo).toBe('R-0123');
    expect(partes!.amenazaCodigo).toBe('A.24');
    expect(partes!.justificacion).toBe(
      'Residual crítico de TEC-DAT-0009 — Denegación de servicio.',
    );
  });

  it('un origen de OTRO activo no se toca', () => {
    expect(reemplazarActivoEnOrigen(ORIGEN, 'PRO-DAT-0002', 'EST-DAT-0031')).toBeNull();
  });

  it('un origen sin el prefijo verificable no se toca', () => {
    // Los planes nacidos desde la pantalla de controles: no cubren un riesgo puntual, así
    // que no hay nada que reapuntar.
    expect(
      reemplazarActivoEnOrigen(
        'Agregada desde Controles y madurez — A.8.14 en L1.',
        'TEC-DAT-0009',
        'EST-DAT-0031',
      ),
    ).toBeNull();
  });

  it('una narrativa con separadores adentro sobrevive el round-trip', () => {
    // La justificación puede traer « · » o «|»; el formato solo mira los primeros
    // separadores, y reemitir no puede ser la operación que rompa ese contrato.
    const conSeparadores = formatearOrigen(
      'R-0500',
      'TEC-DAT-0009',
      'A.11',
      'Acordado con el comité · pendiente | ver acta 2026-09',
    );
    const partes = parsearOrigen(
      reemplazarActivoEnOrigen(conSeparadores, 'TEC-DAT-0009', 'EST-DAT-0031')!,
    );
    expect(partes!.justificacion).toBe('Acordado con el comité · pendiente | ver acta 2026-09');
  });
});

// ===========================================================================
// El consecutivo disponible — por que el contador solo no alcanza
// ===========================================================================

describe('siguienteConsecutivo', () => {
  it('cuando el contador va adelante, manda el contador', () => {
    expect(siguienteConsecutivo(40, 12)).toBe(40);
  });

  it('cuando la serie va adelante, se salta por encima de ella', () => {
    // El caso real: la carga del V19 preservo codigos `TEC-…` de activos que no estan en
    // Gestion Tecnologica, asi que ocupan numeros de la serie sin haber incrementado el
    // contador de ese par. El contador entrega 23 y `TEC-DAT-0134` ya existe.
    expect(siguienteConsecutivo(23, 134)).toBe(135);
  });

  it('empatados, el contador ya es el siguiente', () => {
    expect(siguienteConsecutivo(10, 9)).toBe(10);
  });

  it('una serie vacia deja mandar al contador', () => {
    expect(siguienteConsecutivo(1, 0)).toBe(1);
  });
});

describe('consecutivoDe', () => {
  it('lee los cuatro digitos finales', () => {
    expect(consecutivoDe('TEC-DAT-0134')).toBe(134);
  });

  it('un codigo ilegible aporta 0 en vez de romper el maximo', () => {
    expect(consecutivoDe('roto')).toBe(0);
    expect(consecutivoDe('TEC-DAT-ABCD')).toBe(0);
  });
});
