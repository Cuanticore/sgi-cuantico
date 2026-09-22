// app/mi-sig/__tests__/bandeja-progreso.test.tsx
//
// QUIEN HACE EL CURSO TIENE QUE PODER VER SU PROPIO AVANCE.
//
// Hasta el 21/09/2026 la bandeja sólo llevaba `cursoIniciado: boolean` —empezado o no—, y la
// consulta ni siquiera traía `progressMeasure`. El porcentaje existía en la base y lo
// redactaba `progresoDeCurso`, pero lo veía **únicamente un administrador**, en
// `/sig/colaboradores/[id]`. La persona que estaba recorriendo el curso no tenía dónde verlo.
//
// El contraste que lo hace evidente: se migró `gestionar-leads` de SCORM 1.2 a 2004
// precisamente para tener `cmi.progress_measure`, y quien recorre el curso no iba a verlo.
//
// Lo que estas pruebas sostienen es la redacción, no el cálculo: `progresoDeCurso` ya está
// probado en `lib/sig/__tests__/`. Acá se comprueba que la frase LLEGUE a la pantalla, y que
// no aparezca donde no corresponde.

// Los dos paneles se sustituyen porque arrastran `app/sig/acciones/tareas.ts` y con él
// `next/cache`, que en jsdom revienta con `TextEncoder is not defined` antes de que corra
// una sola prueba. No son lo que se está probando: la tarjeta redacta el avance sin
// abrirlos, y sustituirlos deja la prueba mirando exactamente lo que dice mirar.
jest.mock('../PanelCierre', () => ({ __esModule: true, default: () => null }));
jest.mock('../PanelFirma', () => ({ __esModule: true, default: () => null }));

import { render, screen } from '@testing-library/react';
import BandejaClient from '../bandeja.client';
import type { Bandeja, TarjetaBandeja } from '../bandeja.query';

function tarjeta(extra: Partial<TarjetaBandeja>): TarjetaBandeja {
  return {
    id: 1,
    tipo: 'CURSO_VIRTUAL',
    exigeFirma: false,
    declaracion: null,
    codigo: 'CUR-003',
    titulo: 'Gestión de Leads',
    descripcion: '',
    procedimientoOrigen: null,
    version: 1,
    periodo: '2026',
    fechaLimite: new Date('2026-10-07T00:00:00Z'),
    fechaCierre: null,
    estado: 'PENDIENTE',
    vencida: false,
    dias: 15,
    exigeEvaluacion: true,
    notaMinima: 80,
    tienePaqueteScorm: true,
    claseCurso: 'PAQUETE',
    cursoIniciado: true,
    documentoVersion: null,
    documentoUrl: null,
    documentoNombre: null,
    cierreAdministrativo: false,
    items: [],
    progreso: null,
    ...extra,
  };
}

function bandeja(t: TarjetaBandeja): Bandeja {
  return {
    persona: { nombre: 'Daniel Medina', area: 'Gestión Estratégica', cargo: 'CEO' },
    contadores: { vencidas: 0, porVencer: 0, realizadasPeriodo: 0 },
    vencidas: [],
    porVencer: [],
    pendientes: [t],
    realizadas: [],
  };
}

describe('la bandeja muestra el avance del curso', () => {
  it('pinta la frase que redactó progresoDeCurso', () => {
    render(
      <BandejaClient
        bandeja={bandeja(
          tarjeta({
            progreso: {
              intentos: 1,
              numero: 1,
              estado: 'EN_CURSO',
              porcentaje: 50,
              etiqueta: 'Va por el 50%',
              ultimaActividadEn: '2026-09-21',
            },
          }),
        )}
      />,
    );

    expect(screen.getByText('Va por el 50%')).toBeInTheDocument();
  });

  // La frase la arma `progresoDeCurso` y la pantalla la repite tal cual. Si la pantalla
  // recompusiera el texto a partir del porcentaje, habría dos redacciones del mismo hecho y
  // el día que una diga «45%» y la otra «empezado» nadie podría decir cuál miente — que es
  // exactamente el argumento del encabezado de `lib/sig/formacion.ts`.
  it('un curso suspendido dice que está guardado, no que va por ahí', () => {
    render(
      <BandejaClient
        bandeja={bandeja(
          tarjeta({
            progreso: {
              intentos: 1,
              numero: 1,
              estado: 'SUSPENDIDO',
              porcentaje: 50,
              etiqueta: 'Guardado en el 50% para seguir',
              ultimaActividadEn: '2026-09-21',
            },
          }),
        )}
      />,
    );

    expect(screen.getByText('Guardado en el 50% para seguir')).toBeInTheDocument();
  });

  // **`null` no es cero.** Un paquete que no reporta avance —cualquier SCORM 1.2, y un 2004
  // que no escriba `cmi.progress_measure`— no debe producir un «0 %» en la tarjeta: eso
  // afirmaría que la persona no avanzó nada, y lo único que el sistema sabe es que el
  // paquete no lo dijo. `progresoDeCurso` ya redacta ese caso sin porcentaje.
  it('un curso que no reporta avance no muestra ningún porcentaje', () => {
    render(
      <BandejaClient
        bandeja={bandeja(
          tarjeta({
            progreso: {
              intentos: 1,
              numero: 1,
              estado: 'EN_CURSO',
              porcentaje: null,
              etiqueta: 'Empezado; el curso no reporta avance',
              ultimaActividadEn: '2026-09-21',
            },
          }),
        )}
      />,
    );

    expect(screen.getByText('Empezado; el curso no reporta avance')).toBeInTheDocument();
    expect(screen.queryByText(/0\s*%/)).not.toBeInTheDocument();
  });

  it('sin intentos no hay nada que decir sobre el avance', () => {
    render(<BandejaClient bandeja={bandeja(tarjeta({ progreso: null, cursoIniciado: false }))} />);

    expect(screen.getByText('Gestión de Leads')).toBeInTheDocument();
    expect(screen.queryByText(/Va por el/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Guardado en el/)).not.toBeInTheDocument();
  });

  // Una LECTURA no tiene avance que mostrar, y una tarjeta que lo intentara estaría hablando
  // de algo que no existe. `avanceDelCurso` ya devuelve `null` para todo lo que no sea un
  // curso de paquete; esto comprueba que la pantalla no lo reintroduzca por su cuenta.
  it('una lectura no habla de avance aunque tenga la forma de una tarjeta', () => {
    render(
      <BandejaClient
        bandeja={bandeja(
          tarjeta({
            tipo: 'LECTURA',
            claseCurso: null,
            tienePaqueteScorm: false,
            cursoIniciado: false,
            titulo: 'Política de seguridad',
            progreso: null,
          }),
        )}
      />,
    );

    expect(screen.getByText('Política de seguridad')).toBeInTheDocument();
    expect(screen.queryByText(/avance|Va por el|Guardado en el/)).not.toBeInTheDocument();
  });
});
