// app/sig/contenidos/__tests__/criterio-aprobacion.test.tsx
//
// EL CRITERIO DE APROBACIÓN SE QUEDÓ EN EL TIPO VIEJO.
//
// «Criterio de aprobación» —la casilla «Exige evaluación» y el `≥ __ %`— se dibujaba sólo
// dentro de `if (tipo === 'CAPACITACION')`. Cuando REQ-SIG-24/26 separó `CURSO_VIRTUAL` como
// tipo propio, el tipo nuevo heredó el reproductor y el veredicto **pero no el campo que los
// alimenta**: `veredictoDelIntento` lee `exigeEvaluacion` y `notaMinima` del contenido, y no
// había pantalla desde la cual ponerlos en un curso virtual.
//
// Lo que eso produce no es que todo cierre: `veredictoDelIntento` cae a lo que el SCO reporte
// en `success_status`, así que un curso que se declara reprobado no cierra. Lo que produce es
// **que el criterio lo decida el paquete y no la organización** —contra P15, que dice que el
// veredicto lo da el SIG— y que un paquete que reporte `completed` con nota pero sin
// `success_status` cierre con `aprobado` en nulo, saque lo que saque.
//
// No era una restricción del servidor: el formulario ya enviaba los dos campos y
// `validarDatosContenido` no los rechazaba. Faltaba dibujarlos.

// Las acciones de servidor se sustituyen porque arrastran `next/cache`, que en jsdom revienta
// con `TextEncoder is not defined` antes de que corra una sola prueba. Ninguna se invoca acá:
// lo que se mira es qué campos dibuja la ficha, no qué guarda.
jest.mock('@/app/sig/acciones/tareas', () => ({
  crearContenido: jest.fn(),
  duplicarContenido: jest.fn(),
  editarContenido: jest.fn().mockResolvedValue({ ok: true, mensaje: 'listo' }),
}));
jest.mock('@/app/sig/acciones/scorm', () => ({ subirPaqueteScorm: jest.fn() }));

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ContenidosClient, { type ContenidoFila } from '../Contenidos.client';
import { editarContenido } from '@/app/sig/acciones/tareas';

function contenido(extra: Partial<ContenidoFila>): ContenidoFila {
  return {
    id: 1,
    codigo: 'CUR-003',
    tipo: 'CURSO_VIRTUAL',
    claseCurso: 'PAQUETE',
    titulo: 'Gestión de Leads',
    descripcion: 'Módulo 1',
    procedimientoOrigen: null,
    version: 1,
    documentoCodigo: null,
    documentoNombre: null,
    documentoVersion: null,
    documentoUrl: null,
    modalidad: null,
    duracionHoras: null,
    exigeEvaluacion: false,
    notaMinima: null,
    items: [],
    versiones: [],
    paquetes: [],
    usos: [],
    ...extra,
  };
}

describe('el criterio de aprobación de un curso virtual', () => {
  it('se puede declarar desde la ficha', () => {
    render(<ContenidosClient contenidos={[contenido({})]} />);

    expect(screen.getByLabelText(/Exige evaluación/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/nota mínima/i)).toBeInTheDocument();
  });

  // El campo de la nota está deshabilitado mientras no se exija evaluación: un mínimo sin
  // evaluación exigida es un número que no rige, y dejarlo escribible invita a creer que sí.
  it('la nota no se puede escribir si no se exige evaluación', () => {
    render(<ContenidosClient contenidos={[contenido({ exigeEvaluacion: false })]} />);

    expect(screen.getByLabelText(/nota mínima/i)).toBeDisabled();
  });

  it('con evaluación exigida, la nota se escribe y muestra lo guardado', () => {
    render(
      <ContenidosClient contenidos={[contenido({ exigeEvaluacion: true, notaMinima: 80 })]} />,
    );

    const nota = screen.getByLabelText(/nota mínima/i);
    expect(nota).toBeEnabled();
    expect(nota).toHaveValue('80');
  });

  // La capacitación no pierde nada: es de donde sale el bloque y tiene que seguir teniéndolo.
  it('una capacitación lo sigue teniendo', () => {
    render(
      <ContenidosClient
        contenidos={[
          contenido({ id: 2, codigo: 'CAP-001', tipo: 'CAPACITACION', claseCurso: null }),
        ]}
      />,
    );

    expect(screen.getByLabelText(/Exige evaluación/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/nota mínima/i)).toBeInTheDocument();
  });

  // **La prueba que faltaba, y casi se me escapa.** Dibujar el campo no alcanza: el payload
  // de `guardar()` armaba `exigeEvaluacion` y `notaMinima` DENTRO del spread de
  // `tipo === 'CAPACITACION'`, así que un curso virtual habría mostrado un campo editable y
  // descartado en silencio lo que se escribiera en él.
  //
  // Un campo que acepta y no guarda es peor que uno ausente: el ausente manda a preguntar, el
  // que miente deja a alguien creyendo que declaró un criterio que no existe.
  it('lo que se declara llega al servidor, no sólo a la pantalla', async () => {
    render(
      <ContenidosClient contenidos={[contenido({ exigeEvaluacion: true, notaMinima: 80 })]} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(editarContenido).toHaveBeenCalledTimes(1));
    const datos = (editarContenido as jest.Mock).mock.calls[0][1];
    expect(datos.exigeEvaluacion).toBe(true);
    expect(datos.notaMinima).toBe(80);
  });

  // Y una lectura no: no hay nada que evaluar, y un criterio de aprobación ahí sería un campo
  // que no gobierna nada.
  it('una lectura no habla de criterio de aprobación', () => {
    render(
      <ContenidosClient
        contenidos={[
          contenido({ id: 3, codigo: 'POL-001', tipo: 'LECTURA', claseCurso: null, documentoVersion: '3' }),
        ]}
      />,
    );

    expect(screen.queryByLabelText(/Exige evaluación/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/nota mínima/i)).not.toBeInTheDocument();
  });
});
