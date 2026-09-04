'use client';

// app/tecnologia/niveles/Niveles.client.tsx
//
// El árbol de tres grados y las plantillas.
//
// **La jerarquía se dibuja como árbol y no como tres listas.** Es la diferencia entera con
// el Excel: allá son tres columnas y `MINTRACE` puede aparecer bajo `EMPRESA` sin que nada
// lo impida. Acá cada nivel cuelga de su padre y el que no cuelga de ninguno se ve suelto.

import { useState } from 'react';
import { aplicarPlantilla, crearNivel, desactivarNivel } from '@/app/sig/acciones/niveles';
import { ETIQUETA_CLASE, type ClaseNivel } from '@/lib/sig/niveles';

export interface NivelFila {
  id: number;
  grado: number;
  nombre: string;
  padreId: number | null;
  clase: ClaseNivel | null;
  activo: boolean;
  activos: number;
}

export default function NivelesClient({
  niveles,
  plantilla,
  sinClasificar,
}: {
  niveles: NivelFila[];
  plantilla: { claseNivel: ClaseNivel; nombreNivel3: string; activoEsperado: string; obligatorio: boolean }[];
  sinClasificar: number;
}) {
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [nuevoEn, setNuevoEn] = useState<number | null>(null);
  const [nombre, setNombre] = useState('');
  const [plantillaEn, setPlantillaEn] = useState<number | null>(null);
  const [nombreProducto, setNombreProducto] = useState('');
  const [enviando, setEnviando] = useState(false);

  const raices = niveles.filter((n) => n.grado === 1);
  const hijosDe = (id: number) => niveles.filter((n) => n.padreId === id);
  // Los que apuntan a un padre que no existe o que no está en la lista. Se muestran aparte
  // en vez de omitirse: un nivel que no cuelga de nada y no se ve es un nivel perdido.
  const sueltos = niveles.filter(
    (n) => n.grado > 1 && (n.padreId === null || !niveles.some((p) => p.id === n.padreId)),
  );

  async function correr(fn: () => Promise<{ ok: boolean; mensaje: string }>) {
    setEnviando(true);
    const r = await fn();
    setEnviando(false);
    setAviso({ ok: r.ok, texto: r.mensaje });
    if (r.ok) setTimeout(() => window.location.reload(), 1200);
  }

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex max-w-[100ch] flex-col gap-1.5">
        <h1 className="titulo-pagina">Niveles del inventario</h1>
        <p className="text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
          Tres grados, y es{' '}
          <strong className="font-semibold text-secondary">una jerarquía de verdad</strong>: el
          nivel 2 pertenece a un nivel 1 y el 3 a un 2. El activo apunta al nivel 3, el más
          específico; los otros dos se derivan subiendo.
        </p>
      </div>

      {aviso && (
        <p
          className="mt-4 rounded-campo px-3 py-2 text-12 leading-relaxed [text-wrap:pretty]"
          style={{
            background: aviso.ok ? 'var(--hf-accent-100)' : 'var(--hf-danger-bg)',
            color: aviso.ok ? 'var(--hf-accent-700)' : 'var(--hf-danger-text)',
          }}
        >
          {aviso.texto}
        </p>
      )}

      {sinClasificar > 0 && (
        <p
          className="mt-4 rounded-tarjeta px-4 py-3 text-11_5 leading-relaxed [text-wrap:pretty]"
          style={{ background: '#fff3e6', border: '1px solid #f2b473', color: '#8a4407' }}
        >
          <strong className="font-semibold">{sinClasificar} activos vigentes sin nivel.</strong> La
          migración no los repartió a propósito: nadie dijo a cuál pertenece cada uno, y
          repartirlos por su área habría inventado la jerarquía que esta pantalla existe para
          levantar. Es trabajo pendiente, no un defecto.
        </p>
      )}

      <div className="mt-4 flex flex-col gap-4 xl:flex-row">
        <section className="min-w-0 flex-1 rounded-tarjeta border border-border-field bg-surface px-4 py-3.5">
          <Rotulo texto="Jerarquía" derecha={`${niveles.length} nodos`} />
          <div className="mt-2 flex flex-col gap-1">
            {raices.map((r) => (
              <div key={r.id} className="flex flex-col gap-1">
                <Fila
                  n={r}
                  onNuevo={() => {
                    setNuevoEn(r.id);
                    setNombre('');
                  }}
                  onPlantilla={
                    r.clase === 'EMPRESA'
                      ? undefined
                      : () => {
                          setPlantillaEn(r.id);
                          setNombreProducto('');
                        }
                  }
                  onDesactivar={null}
                />
                {plantillaEn === r.id && (
                  <div className="ml-6 flex flex-wrap items-end gap-2 rounded-campo border border-border-field bg-subtle px-3 py-2.5">
                    <label className="flex flex-col gap-1">
                      <span className="etiqueta-campo">Nombre del {r.clase === 'PRODUCTOS' ? 'producto' : 'proyecto'}</span>
                      <input
                        value={nombreProducto}
                        onChange={(e) => setNombreProducto(e.target.value)}
                        className="entrada-campo w-[220px]"
                        placeholder="MINTRACE"
                      />
                    </label>
                    <button
                      disabled={enviando || nombreProducto.trim() === ''}
                      onClick={() => correr(() => aplicarPlantilla(r.id, nombreProducto))}
                      className="rounded-campo px-3.5 py-2 text-12 font-semibold text-white disabled:opacity-50"
                      style={{ background: 'var(--hf-brand-nav)' }}
                    >
                      Crear con la plantilla
                    </button>
                    <button onClick={() => setPlantillaEn(null)} className="px-2 py-2 text-12 text-muted">
                      Cancelar
                    </button>
                    <span className="w-full text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
                      Crea los nodos de nivel 2 y 3 que la configuración mínima espera. NO crea
                      activos: los esperados quedan como faltantes a la vista, porque la
                      plantilla señala y no rellena.
                    </span>
                  </div>
                )}
                {nuevoEn === r.id && (
                  <FormularioNivel
                    grado={2}
                    nombre={nombre}
                    setNombre={setNombre}
                    enviando={enviando}
                    onGuardar={() => correr(() => crearNivel({ grado: 2, nombre, padreId: r.id }))}
                    onCancelar={() => setNuevoEn(null)}
                  />
                )}

                {hijosDe(r.id).map((h2) => (
                  <div key={h2.id} className="ml-6 flex flex-col gap-1">
                    <Fila
                      n={h2}
                      onNuevo={() => {
                        setNuevoEn(h2.id);
                        setNombre('');
                      }}
                      onDesactivar={() => {
                        const motivo = window.prompt('¿Por qué se desactiva este nivel?') ?? '';
                        if (motivo.trim() !== '') void correr(() => desactivarNivel(h2.id, motivo));
                      }}
                    />
                    {nuevoEn === h2.id && (
                      <FormularioNivel
                        grado={3}
                        nombre={nombre}
                        setNombre={setNombre}
                        enviando={enviando}
                        onGuardar={() => correr(() => crearNivel({ grado: 3, nombre, padreId: h2.id }))}
                        onCancelar={() => setNuevoEn(null)}
                      />
                    )}
                    {hijosDe(h2.id).map((h3) => (
                      <div key={h3.id} className="ml-6">
                        <Fila
                          n={h3}
                          onDesactivar={() => {
                            const motivo = window.prompt('¿Por qué se desactiva este nivel?') ?? '';
                            if (motivo.trim() !== '') void correr(() => desactivarNivel(h3.id, motivo));
                          }}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {sueltos.length > 0 && (
            <div className="mt-4 border-t border-hairline pt-3">
              <Rotulo texto="Sueltos · sin padre en la jerarquía" />
              <p className="mt-1.5 text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
                Cuelgan de un nivel que no existe. Se muestran acá en vez de omitirse: un nivel
                que no se ve es un nivel perdido.
              </p>
              <div className="mt-1.5 flex flex-col gap-1">
                {sueltos.map((n) => (
                  <Fila key={n.id} n={n} onDesactivar={null} />
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="w-full flex-none rounded-tarjeta border border-border-field bg-surface px-4 py-3.5 xl:w-[380px]">
          <Rotulo texto="Configuración mínima" derecha={`${plantilla.length} esperados`} />
          <p className="mt-1.5 text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
            Lo que un producto o proyecto debe tener. Es lo que convierte el inventario en algo
            verificable: la ficha puede decir «le faltan el ambiente de staging y la
            documentación pública», que es el trabajo que hoy nadie hace porque nadie sabe qué
            debería estar.
          </p>
          {(['PRODUCTOS', 'PROYECTOS'] as const).map((clase) => {
            const dela = plantilla.filter((p) => p.claseNivel === clase);
            if (dela.length === 0) return null;
            return (
              <div key={clase} className="mt-3 flex flex-col gap-1.5">
                <span className="font-mono text-9 font-semibold uppercase tracking-[0.07em] text-muted">
                  {ETIQUETA_CLASE[clase]}
                </span>
                {[...new Set(dela.map((p) => p.nombreNivel3))].map((n3) => (
                  <div key={n3} className="rounded-campo border border-border-field bg-subtle px-3 py-2">
                    <span className="text-11_5 font-medium text-primary">{n3}</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {dela
                        .filter((p) => p.nombreNivel3 === n3)
                        .map((p) => (
                          <span
                            key={p.activoEsperado}
                            className="rounded-[4px] px-1.5 py-0.5 font-mono text-9"
                            style={
                              p.obligatorio
                                ? { background: 'var(--hf-brand-100)', color: 'var(--hf-brand-nav)' }
                                : { background: 'var(--hf-bg-surface)', color: 'var(--hf-text-muted)' }
                            }
                            title={p.obligatorio ? 'obligatorio' : 'opcional'}
                          >
                            {p.activoEsperado}
                            {!p.obligatorio && ' · opcional'}
                          </span>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </section>
      </div>
    </main>
  );
}

function Fila({
  n,
  onNuevo,
  onPlantilla,
  onDesactivar,
}: {
  n: NivelFila;
  onNuevo?: () => void;
  onPlantilla?: () => void;
  onDesactivar?: (() => void) | null;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2.5 rounded-campo border border-border-field px-3 py-2"
      style={{
        background: n.grado === 1 ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
        opacity: n.activo ? 1 : 0.5,
      }}
    >
      <span
        className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[4px] font-mono text-9 font-bold"
        style={{ background: 'var(--hf-bg-subtle)', color: 'var(--hf-text-muted)' }}
      >
        {n.grado}
      </span>
      <span className="text-12_5 font-medium text-primary">{n.nombre}</span>
      {n.clase !== null && (
        <span className="rounded-[4px] bg-surface px-1.5 py-0.5 font-mono text-8_5 uppercase text-muted">
          {ETIQUETA_CLASE[n.clase]}
        </span>
      )}
      {!n.activo && (
        <span className="font-mono text-8_5 uppercase text-faint">inactivo</span>
      )}
      {n.activos > 0 && (
        <span className="font-mono text-9_5 text-muted">{n.activos} activo(s)</span>
      )}
      <span className="ml-auto flex gap-1.5">
        {onPlantilla !== undefined && (
          <button
            onClick={onPlantilla}
            className="rounded-campo border border-border-field bg-surface px-2 py-1 text-10_5 text-secondary"
          >
            + Con plantilla
          </button>
        )}
        {onNuevo !== undefined && (
          <button
            onClick={onNuevo}
            className="rounded-campo border border-border-field bg-surface px-2 py-1 text-10_5 text-secondary"
          >
            + Nivel {n.grado + 1}
          </button>
        )}
        {onDesactivar != null && n.activo && (
          <button onClick={onDesactivar} className="px-1.5 py-1 text-10_5 text-muted">
            Desactivar
          </button>
        )}
      </span>
    </div>
  );
}

function FormularioNivel({
  grado,
  nombre,
  setNombre,
  enviando,
  onGuardar,
  onCancelar,
}: {
  grado: number;
  nombre: string;
  setNombre: (v: string) => void;
  enviando: boolean;
  onGuardar: () => void;
  onCancelar: () => void;
}) {
  return (
    <div className="ml-6 flex flex-wrap items-end gap-2 rounded-campo border border-border-field bg-subtle px-3 py-2.5">
      <label className="flex flex-col gap-1">
        <span className="etiqueta-campo">Nombre del nivel {grado}</span>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="entrada-campo w-[220px]"
          autoFocus
        />
      </label>
      <button
        disabled={enviando || nombre.trim() === ''}
        onClick={onGuardar}
        className="rounded-campo px-3.5 py-2 text-12 font-semibold text-white disabled:opacity-50"
        style={{ background: 'var(--hf-brand-nav)' }}
      >
        Crear
      </button>
      <button onClick={onCancelar} className="px-2 py-2 text-12 text-muted">
        Cancelar
      </button>
    </div>
  );
}

function Rotulo({ texto, derecha }: { texto: string; derecha?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex-none font-mono text-9 font-semibold uppercase tracking-[0.07em] text-accent">
        {texto}
      </span>
      <span className="h-px flex-1 bg-hairline" />
      {derecha !== undefined && <span className="flex-none font-mono text-9 text-faint">{derecha}</span>}
    </span>
  );
}
