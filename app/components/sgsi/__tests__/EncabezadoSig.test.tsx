/**
 * @jest-environment node
 */

// app/components/sgsi/__tests__/EncabezadoSig.test.tsx
//
// **Corrección post-entrega de la Fase 2 de `hoja-de-vida-api-servicio`.** `/tokens` se
// entregó sin ningún enlace hacia ella en toda la aplicación — sólo se llegaba escribiendo la
// URL a mano. Se agrega como una pestaña más de la barra corporativa, a la lista `TODAS` que
// ya filtra cada pestaña por permiso: es el mismo mecanismo que ya resolvió exactamente este
// problema para Tecnología («estuvo deshabilitada hasta que REQ-SIG-06 tuvo su primera ruta»).
// No se inventa un prop nuevo en `UserMenu`/`Nav` — ese par no tiene NINGÚN consumidor real en
// la aplicación hoy (sólo se citan entre sí); la barra que de verdad se renderiza en cada
// pantalla, `/tokens` incluida, es ésta.
//
// `EncabezadoSig` es un Server Component async: se invoca directamente como función — sin
// `render()`, sin montar `HeaderCorporativo` — y se inspecciona el elemento de React que
// devuelve. Es la misma garantía que un test de Server Action: no hace falta DOM para probar
// qué pestañas decide mostrar un rol.

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('@/app/lib/auth', () => ({ authOptions: {} }));

import { getServerSession } from 'next-auth';
import EncabezadoSig from '../EncabezadoSig';

const getServerSessionMock = getServerSession as jest.Mock;

interface ElementoConPestanas {
  props: { pestanas: { etiqueta: string; href: string }[] };
}

async function pestanas(grupos: string[]): Promise<{ etiqueta: string; href: string }[]> {
  getServerSessionMock.mockResolvedValue({
    user: { name: 'Ana', email: 'ana@cuantico.com', grupos },
  });
  const elemento = (await EncabezadoSig()) as unknown as ElementoConPestanas;
  return elemento.props.pestanas;
}

describe('la pestaña Tokens', () => {
  it('Líderes SIG la ve, apuntando a /tokens', async () => {
    const vistas = await pestanas(['Líderes SIG']);
    const tokens = vistas.find((p) => p.etiqueta === 'Tokens');
    expect(tokens).toBeDefined();
    expect(tokens?.href).toBe('/tokens');
  });

  it('un Colaborador (sin grupo reconocido) no la ve', async () => {
    const vistas = await pestanas([]);
    expect(vistas.find((p) => p.etiqueta === 'Tokens')).toBeUndefined();
  });

  it('sigue habiendo una pestaña abierta a todos (Mi SIG), sin permiso de por medio', async () => {
    const vistas = await pestanas([]);
    expect(vistas.find((p) => p.etiqueta === 'Mi SIG')).toBeDefined();
  });
});
