// app/lib/__tests__/sharepoint.test.ts
//
// La red se simula; lo que se prueba es lo que la aplicación DEDUCE de cada respuesta de
// Graph. Dos cosas importan más que las demás:
//
//   1. Un 403 tiene que decir «falta el permiso», y nombrarlo. Antes de `graph-fallo.ts`
//      todo fallo era `null` y la pantalla mandaba a conceder permisos ya concedidos.
//   2. Un 409 al subir significa «ya está publicado», no «error»: es lo que hace que el
//      cron pueda reintentar sin duplicar (P6).

const get = jest.fn();
const post = jest.fn();
const put = jest.fn();
const patch = jest.fn();

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: () => ({ get, post, put, patch }),
    isAxiosError: (e: unknown) =>
      typeof e === 'object' && e !== null && 'esDeAxios' in (e as Record<string, unknown>),
  },
}));

function errorGraph(status: number) {
  return { esDeAxios: true, response: { status, data: {} }, message: `status ${status}` };
}

function sinRed() {
  return { esDeAxios: true, code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND' };
}

async function modulo() {
  jest.resetModules();
  return import('../sharepoint');
}

/// Encola las DOS respuestas que `tokenYIds()` consume antes de cualquier operación útil: el
/// sitio y la biblioteca (P7). `jest.resetModules()` devuelve el módulo frío en cada prueba,
/// así que la caché de ids nunca está caliente y esos dos viajes ocurren siempre.
///
/// Sin esto, toda prueba de `subirSoporte` y de `asegurarCarpetaDePersona` muere en
/// `getSiteId` con `SIN_RED` y nunca llega al `put` o al `post` que dice estar probando —
/// incluida la de `SIN_RED`, que pasaba por el motivo equivocado.
function primeroElSitioYLaBiblioteca() {
  get
    .mockResolvedValueOnce({ data: { id: 'sitio-1' } })
    .mockResolvedValueOnce({ data: { value: [{ id: 'drive-1', name: 'Shared Documents' }] } });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.SHAREPOINT_TENANT_ID = 'tenant';
  process.env.SHAREPOINT_CLIENT_ID = 'cliente';
  process.env.SHAREPOINT_CLIENT_SECRET = 'secreto';
  process.env.SHAREPOINT_SITE_URL = 'cuanticore.sharepoint.com';
  process.env.SHAREPOINT_SITE_NAME = 'Cuantico';
  process.env.SHAREPOINT_SOPORTES_PATH = '09. SIG/2. Soportes SIG';
  post.mockResolvedValue({ data: { access_token: 'token' } });
});

describe('resolverCarpetaBase', () => {
  it('resuelve sitio, biblioteca y carpeta base', async () => {
    get
      .mockResolvedValueOnce({ data: { id: 'sitio-1' } })
      .mockResolvedValueOnce({ data: { value: [{ id: 'drive-1', name: 'Shared Documents' }] } })
      .mockResolvedValueOnce({ data: { id: 'carpeta-base' } });

    const { resolverCarpetaBase } = await modulo();
    const r = await resolverCarpetaBase();

    expect(r).toEqual({ ok: true, datos: { driveId: 'drive-1', carpetaBaseId: 'carpeta-base' } });
  });

  // P1 · la carpeta base NO se crea. Crearla convertiría una variable mal escrita en un
  // árbol fantasma dentro de la biblioteca del SIG.
  it('un 404 en la carpeta base es NO_EXISTE y no crea nada', async () => {
    get
      .mockResolvedValueOnce({ data: { id: 'sitio-1' } })
      .mockResolvedValueOnce({ data: { value: [{ id: 'drive-1', name: 'Shared Documents' }] } })
      .mockRejectedValueOnce(errorGraph(404));

    const { resolverCarpetaBase } = await modulo();
    const r = await resolverCarpetaBase();

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fallo.causa).toBe('NO_EXISTE');
    expect(post).not.toHaveBeenCalledWith(
      expect.stringContaining('/children'),
      expect.anything(),
      expect.anything(),
    );
  });

  it('sin variables no intenta ninguna consulta', async () => {
    process.env.SHAREPOINT_CLIENT_SECRET = '';
    const { resolverCarpetaBase } = await modulo();
    const r = await resolverCarpetaBase();

    expect(r.ok).toBe(false);
    if (!r.ok && r.fallo.causa === 'SIN_CONFIGURAR') {
      expect(r.fallo.faltan).toContain('SHAREPOINT_CLIENT_SECRET');
    } else {
      throw new Error('se esperaba SIN_CONFIGURAR');
    }
    expect(get).not.toHaveBeenCalled();
  });
});

describe('subirSoporte', () => {
  it('sube y devuelve el id y el enlace', async () => {
    primeroElSitioYLaBiblioteca();
    put.mockResolvedValueOnce({ data: { id: 'item-9', webUrl: 'https://sp/acta.txt' } });

    const { subirSoporte } = await modulo();
    const r = await subirSoporte(
      'drive-1',
      'carpeta-1',
      'ACT-2026-0001.txt',
      Buffer.from('acta'),
      'text/plain',
    );

    expect(r).toEqual({ ok: true, datos: { id: 'item-9', webUrl: 'https://sp/acta.txt' } });
    expect(put).toHaveBeenCalledWith(
      expect.stringContaining('conflictBehavior=fail'),
      expect.anything(),
      expect.anything(),
    );
  });

  // P6 · el reintento tiene que ser idempotente: un 409 es «ya está», no un fallo.
  it('un 409 se resuelve consultando el ítem que ya existe', async () => {
    primeroElSitioYLaBiblioteca();
    put.mockRejectedValueOnce(errorGraph(409));
    get.mockResolvedValueOnce({ data: { id: 'item-previo', webUrl: 'https://sp/previo.txt' } });

    const { subirSoporte } = await modulo();
    const r = await subirSoporte(
      'drive-1',
      'carpeta-1',
      'ACT-2026-0001.txt',
      Buffer.from('acta'),
      'text/plain',
    );

    expect(r).toEqual({ ok: true, datos: { id: 'item-previo', webUrl: 'https://sp/previo.txt' } });
  });

  it('un 403 nombra el permiso que falta', async () => {
    primeroElSitioYLaBiblioteca();
    put.mockRejectedValueOnce(errorGraph(403));

    const { subirSoporte } = await modulo();
    const r = await subirSoporte('drive-1', 'carpeta-1', 'a.txt', Buffer.from('a'), 'text/plain');

    expect(r.ok).toBe(false);
    if (!r.ok && r.fallo.causa === 'SIN_PERMISO') {
      expect(r.fallo.permiso).toBe('Sites.Selected (rol write)');
    } else {
      throw new Error('se esperaba SIN_PERMISO');
    }
  });

  it('sin respuesta de la red es SIN_RED, no una respuesta inesperada', async () => {
    // El sitio y la biblioteca resuelven bien: lo que se cae es LA SUBIDA, que es lo que
    // esta prueba afirma. Sin primar, fallaba antes de llegar al `put` y el verde era falso.
    primeroElSitioYLaBiblioteca();
    put.mockRejectedValueOnce(sinRed());

    const { subirSoporte } = await modulo();
    const r = await subirSoporte('drive-1', 'carpeta-1', 'a.txt', Buffer.from('a'), 'text/plain');

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fallo.causa).toBe('SIN_RED');
  });
});

describe('asegurarCarpetaDePersona', () => {
  it('crea la carpeta cuando no hay una conocida', async () => {
    primeroElSitioYLaBiblioteca();
    post.mockResolvedValueOnce({ data: { access_token: 'token' } });
    post.mockResolvedValueOnce({ data: { id: 'carpeta-nueva' } });

    const { asegurarCarpetaDePersona } = await modulo();
    const r = await asegurarCarpetaDePersona('drive-1', 'carpeta-base', 'daniel.medina', null);

    expect(r).toEqual({ ok: true, datos: { id: 'carpeta-nueva', nombre: 'daniel.medina' } });
  });

  // P6 aplicado a carpetas: si ya existe, se adopta la que está.
  it('un 409 al crear adopta la carpeta existente', async () => {
    primeroElSitioYLaBiblioteca();
    post.mockResolvedValueOnce({ data: { access_token: 'token' } });
    post.mockRejectedValueOnce(errorGraph(409));
    get.mockResolvedValueOnce({ data: { id: 'carpeta-previa' } });

    const { asegurarCarpetaDePersona } = await modulo();
    const r = await asegurarCarpetaDePersona('drive-1', 'carpeta-base', 'daniel.medina', null);

    expect(r).toEqual({ ok: true, datos: { id: 'carpeta-previa', nombre: 'daniel.medina' } });
  });

  // P4 · si el correo cambió, la carpeta se RENOMBRA por su id. No se crea una segunda:
  // los soportes de una persona viven en un solo lugar.
  it('renombra por id cuando el nombre conocido ya no coincide', async () => {
    primeroElSitioYLaBiblioteca();
    patch.mockResolvedValueOnce({ data: { id: 'carpeta-1', name: 'daniel.medina' } });

    const { asegurarCarpetaDePersona } = await modulo();
    const r = await asegurarCarpetaDePersona('drive-1', 'carpeta-base', 'daniel.medina', {
      id: 'carpeta-1',
      nombre: 'dmedina',
    });

    expect(r).toEqual({ ok: true, datos: { id: 'carpeta-1', nombre: 'daniel.medina' } });
    expect(patch).toHaveBeenCalledWith(
      expect.stringContaining('/items/carpeta-1'),
      { name: 'daniel.medina' },
      expect.anything(),
    );
    expect(post).not.toHaveBeenCalledWith(
      expect.stringContaining('/children'),
      expect.anything(),
      expect.anything(),
    );
  });

  it('con la carpeta conocida y el nombre igual no llama a Graph', async () => {
    const { asegurarCarpetaDePersona } = await modulo();
    const r = await asegurarCarpetaDePersona('drive-1', 'carpeta-base', 'daniel.medina', {
      id: 'carpeta-1',
      nombre: 'daniel.medina',
    });

    expect(r).toEqual({ ok: true, datos: { id: 'carpeta-1', nombre: 'daniel.medina' } });
    expect(patch).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
});
