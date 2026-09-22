// app/components/sgsi/valoracion-riesgos/__tests__/PantallaAnalisisRiesgos.test.tsx
//
// REQ-SIG-20 §5 (P4, D7) — tarea 3.10 (la pantalla) y 3.13 (visitar no escribe nada).
//
// ESTA SUITE SE REORGANIZÓ EL 21/09/2026, CUANDO LA `<table>` PASÓ A SER AG GRID. Conviene
// saber por qué, porque el diff sólo muestra que se fueron pruebas:
//
// La documentación de AG Grid desaconseja jsdom —sin soporte de layout, la virtualización no
// calcula qué filas caben y la grilla puede no rendir ninguna— y recomienda verificar en
// navegador real. Además la grilla entra por `next/dynamic({ ssr: false })`, así que en jsdom
// lo que se monta es su reemplazo de carga. Ninguna prueba de esta suite puede leer una fila.
//
// NINGUNA ASERCIÓN SE PERDIÓ. Cada una se mudó a donde sí puede vivir:
//
//   | Lo que probaba                          | Dónde vive ahora                          |
//   |-----------------------------------------|-------------------------------------------|
//   | el renglón se pinta por la banda (×4)   | columnas-analisis.test.ts · `claseDeFila` |
//   | una columna por dimensión (×3)          | columnas-analisis.test.ts · los `ColDef`  |
//   | «+ plan» en toda fila, y su popup (×7)  | e2e/analisis-riesgos.spec.ts              |
//   | la fila enlaza al overlay               | e2e/analisis-riesgos.spec.ts              |
//   | §14.12 · el orden por RTO               | analisis-riesgos.test.ts · el comparador  |
//
// Lo que se queda acá es lo que NO es de la grilla: las cinco tarjetas, la franja, el rótulo
// de orden, y que esta pantalla no importe ningún módulo de escritura. Eso sigue siendo lo
// que la tarea 3.10 pedía, y sigue corriendo en milisegundos.

import fs from 'fs';
import path from 'path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import PantallaAnalisisRiesgos from '../PantallaAnalisisRiesgos';
import type { ActivoAnalizable } from '@/lib/sgsi/analisis-riesgos';
import type { UmbralRiesgo } from '@/lib/sgsi/riesgo-activo';

const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, refresh: jest.fn() }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/sgsi/valoracion-riesgos',
}));

// El popup de planes importa las acciones de servidor, y ésas arrastran `next/cache` —que
// en jsdom no arranca—. Se simula por la misma razón que `FichaActivo.test.tsx` simula el
// suyo: lo que se prueba acá es la pantalla, no el popup. Su decisión de fondo —cuántos planes
// salen de N amenazas— está probada aparte, y pura, en `planes-por-amenaza.test.ts`.
jest.mock('../PopupPlanesActivo', () => ({
  __esModule: true,
  default: ({ activoCodigo, onCerrar }: { activoCodigo: string; onCerrar: () => void }) => (
    <div role="dialog" aria-label={`Planes de ${activoCodigo}`}>
      <button onClick={onCerrar}>Cerrar</button>
    </div>
  ),
}));

// LA GRILLA SE SIMULA, Y ES LO QUE HACE POSIBLE PROBAR LA COSTURA.
//
// AG Grid no rinde filas en jsdom, así que no hay forma de contar las de verdad. Pero la
// pregunta que importa no es «¿pinta la grilla?» —eso lo responde el e2e— sino «¿la pantalla
// le entrega a la grilla las mismas filas que cuenta en las tarjetas?». Ese es el punto donde
// la garantía se puede romper, y con un doble se observa directamente.
//
// El doble hace dos cosas: publica cuántas filas recibió, y ofrece un botón que simula que el
// lector filtró en la grilla, para comprobar que las tarjetas siguen a lo visible.
jest.mock('../GrillaAnalisis', () => ({
  __esModule: true,
  default: ({
    filas,
    onFilasVisibles,
    encabezado,
  }: {
    filas: { codigo: string }[];
    onFilasVisibles: (f: unknown[]) => void;
    encabezado?: React.ReactNode;
  }) => (
    <div>
      {/* El doble PINTA `encabezado`, porque la grilla real lo pinta: desde que la barra de
          acciones subió a una sola línea, el conteo y el selector de orden se los entrega la
          pantalla a la grilla. Un doble que se lo tragara escondería de las pruebas la mitad
          de lo que la pantalla muestra. */}
      {encabezado}
      <span data-testid="filas-en-la-grilla">{filas.length}</span>
      <button onClick={() => onFilasVisibles(filas.slice(0, 1))}>Simular filtro de columna</button>
    </div>
  ),
}));

/// Cuántas filas recibió la grilla, leído del DOM. Nunca un literal: es la mitad de la
/// comparación que estas pruebas existen para hacer.
///
/// Es `async` porque la grilla entra por `next/dynamic`: en el primer render lo que hay es su
/// reemplazo de carga, y el doble aparece un tic después. Esperarlo con `findBy` en vez de
/// leerlo con `getBy` es la diferencia entre una prueba y una carrera que gana casi siempre.
async function filasEnLaGrilla(): Promise<number> {
  const nodo = await screen.findByTestId('filas-en-la-grilla');
  return Number(nodo.textContent);
}

/// La cifra de una tarjeta, localizada por su etiqueta.
///
/// Se busca por texto y no por `role="button"`: las tarjetas dejaron de ser botones el
/// 21/09/2026, cuando los seis desplegables se retiraron y pasó a filtrar la grilla. Un botón
/// que ya no filtra nada sería una promesa falsa, así que ahora son marcadores.
function cifraDeTarjeta(etiqueta: string): number {
  const rotulo = screen.getByText(etiqueta);
  const tarjeta = rotulo.parentElement;
  if (tarjeta === null) throw new Error(`La tarjeta ${etiqueta} no tiene contenedor`);
  const cifra = tarjeta.querySelector('.tabular-nums');
  return Number(cifra?.textContent);
}

const BANDAS: UmbralRiesgo[] = [
  { nombre: 'Crítico', desde: '20', hasta: '999999', orden: 1 },
  { nombre: 'Alto', desde: '10', hasta: '19.9999', orden: 2 },
  { nombre: 'Medio', desde: '4', hasta: '9.9999', orden: 3 },
  { nombre: 'Bajo', desde: '0', hasta: '3.9999', orden: 4 },
];

function activo(p: Partial<ActivoAnalizable> = {}): ActivoAnalizable {
  return {
    codigo: 'TEC-GEN-0001',
    nombre: 'Activo de prueba',
    valor: 5,
    valores: { D: 5, I: 5, C: 5 },
    criticidad: null,
    proceso: 'Gestión Tecnológica',
    propietario: 'Chief Operating Officer',
    persona: null,
    personaCorreo: null,
    riesgos: [
      {
        amenazaCodigo: 'A.24',
        amenazaNombre: 'Denegación de servicio',
        potencial: '25',
        residual: '25',
        obsoleto: false,
        degradacion: { D: 1, I: 0, C: 0 },
        principal: { codigo: 'A.8.14', nivel: 50 },
      },
    ],
    ...p,
  };
}

const ACTIVOS: ActivoAnalizable[] = [
  activo({ codigo: 'TEC-EQU-0003', valor: 5, proceso: 'Gestión Tecnológica' }),
  activo({
    codigo: 'TEC-GEN-0004',
    valor: 4,
    proceso: 'Gestión Financiera',
    riesgos: [
      // Su principal SÍ alcanza lo exigido (90 %), así que este activo está cubierto y no
      // entra en SIN PLAN — es el contraste que hace legible la cifra del otro.
      { amenazaCodigo: 'A.11', amenazaNombre: 'Acceso no autorizado', potencial: '12', residual: '12', obsoleto: false, degradacion: { D: 1, I: 0, C: 0 }, principal: { codigo: 'A.5.30', nivel: 90 } },
    ],
  }),
];

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchParams = new URLSearchParams();
});

function pintar(props: Partial<React.ComponentProps<typeof PantallaAnalisisRiesgos>> = {}) {
  return render(
    <PantallaAnalisisRiesgos
      activos={ACTIVOS}
      bandas={BANDAS}
      umbral={4}
      procesos={['Gestión Tecnológica', 'Gestión Financiera']}
      propietarios={['Chief Operating Officer']}
      personas={[]}
      accionesParaDeuda={[]}
      sinPlan={[]}
      {...props}
    />,
  );
}

// LA COSTURA, y no las piezas.
//
// `tarjetasDeFilas` está probada aparte y pura (`lib/sgsi/__tests__/analisis-riesgos.test.ts`,
// seis casos): dale filas y cuenta bien. Eso NO cubre lo que se prueba acá, que es que la
// pantalla le pase a ese módulo **las mismas filas que le entrega a la grilla**. Un módulo
// perfecto alimentado con el arreglo equivocado da un número perfecto y falso, y las seis
// pruebas puras siguen verdes.
//
// Es la tesis de HARNESS.md: los tres defectos que costaron producción «vivían entre las
// piezas, no en una», y una suite unitaria no los ve por construcción.
//
// SIN LITERALES EN LA COMPARACIÓN. Antes estas pruebas decían `getByText('2')`, y ese `2` era
// un tercer número que no salía ni de la tarjeta ni de la lista sino del montaje: con un
// literal de por medio, la prueba podía quedarse verde aunque las dos cifras discreparan,
// mientras el montaje produjera casualmente el mismo dígito. Ahora se comparan dos
// observaciones del DOM. (Mérito del señalamiento a otra sesión del repo.)
describe('REQ-SIG-20 §5 · las tarjetas cuentan lo mismo que la lista (tarea 3.10)', () => {
  it('la tarjeta EN ANÁLISIS cuenta exactamente las filas que la grilla recibió', async () => {
    pintar();
    expect(cifraDeTarjeta('EN ANÁLISIS')).toBe(await filasEnLaGrilla());
  });

  it('y el rótulo del encabezado dice ese mismo número, no otro', async () => {
    pintar();
    const enLaGrilla = await filasEnLaGrilla();
    expect(screen.getByText(`${enLaGrilla} activos · orden por peor residual`)).toBeInTheDocument();
  });

  // LA PRUEBA DEL CAMBIO DEL 21/09/2026. Filtrar en la grilla tiene que mover las tarjetas
  // con ella: es justo donde la garantía se rompería si las tarjetas volvieran a contarse
  // desde `FiltrosAnalisis` en vez de desde las filas visibles.
  it('cuando la grilla filtra, las tarjetas siguen a lo visible', async () => {
    pintar();
    await filasEnLaGrilla();
    const antes = cifraDeTarjeta('EN ANÁLISIS');
    fireEvent.click(screen.getByRole('button', { name: 'Simular filtro de columna' }));
    const despues = cifraDeTarjeta('EN ANÁLISIS');
    expect(despues).toBe(1);
    expect(despues).toBeLessThan(antes);
  });

  it('la tarjeta SIN PLAN cuenta las BRECHAS sin AccionPlan que las cubra (REQ-SIG-24 §7)', async () => {
    // TEC-EQU-0003 vale 5 y su principal está en 50 %: la exigencia por valor es 90 %, así
    // que hay una brecha de 40 puntos y ningún AccionPlan que la cubra. TEC-GEN-0004 está en
    // 90 % y no entra. La cifra se compara contra ese reparto, no contra un dígito suelto.
    pintar();
    expect(cifraDeTarjeta('SIN PLAN')).toBe(1);
    expect(cifraDeTarjeta('SIN PLAN')).toBeLessThan(await filasEnLaGrilla());
  });

  it('un AccionPlan activo cuyo origen cubre el riesgo saca al activo de la tarjeta SIN PLAN', async () => {
    pintar({
      accionesParaDeuda: [
        {
          activa: true,
          // Este caso prueba la cobertura POR ORIGEN; sin control, la otra vía no aplica.
          controlCodigo: null,
          origen: 'origen:v1|R-0001|TEC-EQU-0003|A.24 · Residual crítico cubierto',
        },
      ],
    });
    expect(cifraDeTarjeta('SIN PLAN')).toBe(0);
    // Y la lista NO se encoge: cubrir una brecha cambia el estado del activo, no si entra al
    // análisis. Si este número bajara con ella, las dos cifras estarían acopladas mal.
    expect(await filasEnLaGrilla()).toBe(2);
  });

  it('la franja nombrada (tarea 4.17) se muestra cuando hay deuda', () => {
    pintar({
      sinPlan: [
        {
          activoCodigo: 'TEC-EQU-0003',
          activoNombre: 'Activo de prueba',
          amenazaCodigo: 'A.24',
          amenazaNombre: 'Denegación de servicio',
          diasPendiente: 6,
          escalado: false,
        },
      ],
    });
    expect(screen.getByText(/1 activo con riesgo residual Crítico/)).toBeInTheDocument();
  });
});

// El rótulo de orden es de la PANTALLA, no de la grilla, y por eso sigue acá. Lo que la
// grilla aporta —ordenar por columna— se prueba en el e2e; lo que se prueba acá es que el
// rótulo no afirme un criterio que ya no rige.
describe('el rótulo dice el orden efectivo', () => {
  it('arranca diciendo el orden por defecto, que no cambió', async () => {
    pintar();
    const enLaGrilla = await filasEnLaGrilla();
    expect(
      screen.getByText(`${enLaGrilla} activos · orden por peor residual`),
    ).toBeInTheDocument();
  });

  // ESTA PRUEBA AFIRMABA QUE EL SELECTOR «ORDEN» EXISTÍA, y se invirtió el 22/09/2026 cuando
  // se retiró. No se perdió ninguna de sus dos opciones, y eso es lo que ahora se fija:
  //
  //   «Peor residual»     -> la cabecera de esa columna ya ordena por ella
  //   «Criticidad (RTO)»  -> la cabecera de Criticidad ordena por RTO y no por código (§11),
  //                          con el MISMO `compararPorCriticidad` que usaba el selector
  //
  // Es decir que era interfaz duplicada. Se deja escrito el motivo y no sólo el cambio: una
  // prueba que desaparece sin explicación parece una capacidad perdida seis meses después.
  it('el selector de orden se retiró: la grilla ordena por sus cabeceras', async () => {
    pintar();
    await filasEnLaGrilla();
    expect(screen.queryByRole('combobox', { name: /Orden/i })).not.toBeInTheDocument();
  });
});

describe('la pantalla sin nada que analizar', () => {
  it('no monta la grilla y manda a Valoración de activos', () => {
    pintar({ activos: [], sinPlan: [] });
    expect(screen.getByText(/Ningún activo alcanza hoy el umbral/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ir a Valoración de activos/ })).toBeInTheDocument();
  });
});

describe('REQ-SIG-20 §5 · un componente que no escribe (tarea 3.13)', () => {
  it('la pantalla no importa ningún módulo de acciones del servidor', () => {
    const ruta = path.join(process.cwd(), 'app/components/sgsi/valoracion-riesgos/PantallaAnalisisRiesgos.tsx');
    const fuente = fs.readFileSync(ruta, 'utf8');
    expect(fuente).not.toMatch(/from ['"]@\/app\/sgsi\/acciones/);
  });

  // La grilla tampoco: es donde vive el botón que abre el popup, y el popup es quien escribe.
  it('la grilla tampoco importa ningún módulo de acciones del servidor', () => {
    const ruta = path.join(process.cwd(), 'app/components/sgsi/valoracion-riesgos/GrillaAnalisis.tsx');
    const fuente = fs.readFileSync(ruta, 'utf8');
    expect(fuente).not.toMatch(/from ['"]@\/app\/sgsi\/acciones/);
  });
});
