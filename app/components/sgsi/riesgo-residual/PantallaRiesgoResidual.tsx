'use client';

// app/components/sgsi/riesgo-residual/PantallaRiesgoResidual.tsx
//
// Aprobación del riesgo residual. ISO/IEC 27001:2022 6.1.3 e).
//
// TRES REGLAS QUE ESTA PANTALLA NO PUEDE ROMPER, y que sus pruebas fijan:
//
//   · **Los «sin calcular» se cuentan a la vista.** Quedaron fuera del acta porque su peor
//     cifra es desconocida, y un tablero que no los muestra se ve completo cuando no lo está.
//   · **«Sin firmante resoluble» y «pendiente de firma» son textos distintos.** El primero es
//     deuda del catálogo de cargos y no se arregla insistiéndole a nadie; el segundo es una
//     persona a la que hay que buscar. Ninguna celda queda vacía.
//   · **Con el acta desactualizada no se registran firmas.** Recoger firmas sobre cifras que
//     cambiaron es recoger firmas que no valen.
//
// La validación real vive en el servidor: esta pantalla ayuda, no decide.

import { useState, useTransition } from 'react';
import type { VistaRiesgoResidual } from '@/app/sgsi/riesgo-residual/acta.query';
import type { EstadoActa } from '@/lib/sgsi/estado-acta-residual';
import { emitirActaResidual } from '@/app/sgsi/acciones/acta-residual';

const TEXTO_ESTADO: Record<EstadoActa, string> = {
  EMITIDA: 'Emitida · faltan firmas',
  APROBADA: 'Aprobada',
  DESACTUALIZADA: 'Desactualizada',
  VENCIDA: 'Vencida',
  ANULADA: 'Anulada',
};

/// Los tres estados que el acta puede tener y en los que NO tiene sentido recoger una firma
/// más: dos porque el documento dejó de valer, uno porque ya está completo.
const NO_ADMITE_FIRMAS: EstadoActa[] = ['DESACTUALIZADA', 'VENCIDA', 'ANULADA'];

export default function PantallaRiesgoResidual({
  datos,
  puedeEscribir,
}: {
  datos: VistaRiesgoResidual;
  puedeEscribir: boolean;
}) {
  const [pendiente, empezar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  const acta = datos.acta;
  const criticos = datos.filas.filter((f) => f.banda === 'Crítico').length;
  const resolubles = datos.firmantes.filter((f) => f.resoluble);
  const sinResolver = datos.firmantes.length - resolubles.length;
  const firmados = acta?.renglones.filter((r) => r.aprobo).length ?? 0;
  const pendientesDeFirma = resolubles.length - firmados;
  const admiteFirmas = acta !== null && !NO_ADMITE_FIRMAS.includes(acta.estado);

  function emitir() {
    setAviso(null);
    empezar(async () => {
      const r = await emitirActaResidual(datos.periodo);
      setAviso({ ok: r.ok, texto: r.mensaje });
    });
  }

  return (
    <main className="flex flex-col gap-5 p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-16 font-semibold text-primary">Riesgo residual</h1>
          <p className="mt-0.5 text-11_5 text-secondary">
            Aprobación del riesgo residual del periodo {datos.periodo}. Entran los activos cuyo
            peor riesgo residual quedó en banda Alta o Crítica.
          </p>
        </div>
        {puedeEscribir && datos.filas.length > 0 && (
          <button
            type="button"
            onClick={emitir}
            disabled={pendiente}
            className="rounded-campo bg-brand-nav px-3 py-1.5 text-11_5 font-medium text-white disabled:opacity-60"
          >
            {acta === null ? 'Emitir el acta' : 'Emitir una nueva'}
          </button>
        )}
      </header>

      {aviso !== null && (
        <p
          className={`rounded-campo px-3 py-2 text-11_5 ${
            aviso.ok
              ? 'border border-border-field bg-subtle text-secondary'
              : 'border border-warn-border bg-warn-100 text-warn-text'
          }`}
        >
          {aviso.texto}
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Tarjeta etiqueta="Activos por aprobar" valor={datos.filas.length} />
        <Tarjeta etiqueta="En banda Crítica" valor={criticos} tono={criticos > 0 ? 'alerta' : undefined} />
        <Tarjeta etiqueta="Procesos firmados" valor={`${firmados} / ${resolubles.length}`} />
        <Tarjeta
          etiqueta="Pendientes de firma"
          valor={acta === null ? '—' : pendientesDeFirma}
        />
        <Tarjeta
          etiqueta="Sin calcular (fuera del acta)"
          valor={datos.sinCalcular}
          tono={datos.sinCalcular > 0 ? 'aviso' : undefined}
          nota="No se aprueban: su peor cifra es desconocida"
        />
        <Tarjeta
          etiqueta="Sin firmante resoluble"
          valor={sinResolver}
          tono={sinResolver > 0 ? 'aviso' : undefined}
          nota="El cargo líder del proceso no tiene persona activa"
        />
      </section>

      {acta === null ? (
        <p className="rounded-campo border border-border-field bg-subtle px-3 py-2.5 text-11_5 text-secondary">
          {datos.filas.length === 0
            ? 'Ningún activo quedó en banda Alta o Crítica en este periodo: no hay riesgo residual que aprobar.'
            : 'Todavía no se ha emitido el acta de este periodo. Al emitirla se congelan las cifras de arriba y se genera el PDF para firmar.'}
        </p>
      ) : (
        <EstadoDelActa acta={acta} />
      )}

      {acta !== null && (
        <section>
          <h2 className="mb-2 text-13 font-semibold text-primary">Hoja de firmas</h2>
          <table className="w-full border-collapse text-11_5">
            <thead>
              <tr className="border-b border-border-field text-left text-11 text-faint">
                <th className="py-1.5 pr-3 font-medium">Proceso</th>
                <th className="py-1.5 pr-3 font-medium">Cargo</th>
                <th className="py-1.5 pr-3 font-medium">Estado</th>
                <th className="py-1.5 pr-3 text-right font-medium">Activos</th>
                <th className="py-1.5 pr-3 font-medium">Fecha</th>
                <th className="py-1.5 font-medium">Soporte</th>
              </tr>
            </thead>
            <tbody>
              {acta.renglones.map((r) => (
                <tr key={r.areaId} className="border-b border-border-field/60">
                  <td className="py-1.5 pr-3 text-primary">{r.proceso}</td>
                  <td className="py-1.5 pr-3 text-secondary">{r.cargoNombre ?? '—'}</td>
                  <td className="py-1.5 pr-3">
                    <EstadoDeFirma renglon={r} />
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono text-secondary">{r.activos}</td>
                  <td className="py-1.5 pr-3 font-mono text-secondary">{r.fechaFirma ?? ''}</td>
                  <td className="py-1.5">
                    {r.soporteId !== null ? (
                      <a
                        href={`/api/sgsi/acta-residual?que=soporte&id=${r.soporteId}`}
                        className="text-accent underline decoration-from-font underline-offset-2"
                      >
                        Descargar
                      </a>
                    ) : puedeEscribir && admiteFirmas && r.resoluble ? (
                      <button
                        type="button"
                        className="text-accent underline decoration-from-font underline-offset-2"
                      >
                        Registrar firma
                      </button>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {acta.renglones.some((r) => r.registradoPor !== null) && (
            <p className="mt-1.5 text-10_5 text-faint">
              Las firmas se hacen en papel. Lo que este sistema guarda es el registro de que
              ocurrieron, con el soporte que las sostiene y quién lo asentó.
            </p>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-2 text-13 font-semibold text-primary">
          Activos en alcance ({datos.filas.length})
        </h2>
        <table className="w-full border-collapse text-11_5">
          <thead>
            <tr className="border-b border-border-field text-left text-11 text-faint">
              <th className="py-1.5 pr-3 font-medium">Código</th>
              <th className="py-1.5 pr-3 font-medium">Activo</th>
              <th className="py-1.5 pr-3 font-medium">Proceso</th>
              <th className="py-1.5 pr-3 font-medium">Banda</th>
              <th className="py-1.5 text-right font-medium">Residual</th>
            </tr>
          </thead>
          <tbody>
            {datos.filas.map((f) => (
              <tr key={f.codigo} className="border-b border-border-field/60">
                <td className="py-1.5 pr-3 font-mono text-primary">{f.codigo}</td>
                <td className="py-1.5 pr-3 text-primary">{f.nombre}</td>
                <td className="py-1.5 pr-3 text-secondary">{f.proceso}</td>
                <td className="py-1.5 pr-3">
                  <span
                    className={
                      f.banda === 'Crítico'
                        ? 'font-semibold text-warn-text'
                        : 'text-secondary'
                    }
                  >
                    {f.banda}
                  </span>
                </td>
                <td className="py-1.5 text-right font-mono text-secondary">{f.cifra}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function EstadoDelActa({ acta }: { acta: NonNullable<VistaRiesgoResidual['acta']> }) {
  const alarmante = NO_ADMITE_FIRMAS.includes(acta.estado);
  return (
    <section
      className={`rounded-campo border px-3 py-2.5 ${
        alarmante ? 'border-warn-border bg-warn-100' : 'border-border-field bg-subtle'
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-12_5 font-semibold text-primary">{acta.codigo}</span>
        <span className={`text-11_5 font-semibold ${alarmante ? 'text-warn-text' : 'text-secondary'}`}>
          {TEXTO_ESTADO[acta.estado]}
        </span>
        <span className="text-11 text-faint">
          Generada el {acta.generadaEn} por {acta.generadaPor}
        </span>
        <span className="ml-auto flex gap-3">
          <a
            href={`/api/sgsi/acta-residual?id=${acta.id}`}
            className="text-11_5 text-accent underline decoration-from-font underline-offset-2"
          >
            Descargar el acta (PDF)
          </a>
          <a
            href={`/api/sgsi/acta-residual?que=registro&id=${acta.id}`}
            className="text-11_5 text-accent underline decoration-from-font underline-offset-2"
          >
            Descargar el registro (Excel)
          </a>
        </span>
      </div>

      {acta.estado === 'DESACTUALIZADA' && (
        <p className="mt-1.5 text-11_5 text-warn-text">
          Las cifras cambiaron desde que se emitió: esta acta ya no describe el riesgo residual
          vigente. No se pueden registrar más firmas sobre ella — emite una nueva. El acta
          anterior se conserva con las firmas que alcanzó a recoger.
        </p>
      )}
      {acta.estado === 'VENCIDA' && (
        <p className="mt-1.5 text-11_5 text-warn-text">
          Venció la vigencia de esta acta. El riesgo residual se vuelve a aprobar emitiendo una
          nueva.
        </p>
      )}
      {acta.sinCalcular > 0 && (
        <p className="mt-1.5 text-11 text-faint">
          Cuando se emitió, {acta.sinCalcular} activos quedaron fuera por tener algún riesgo sin
          residual calculado.
        </p>
      )}
    </section>
  );
}

function EstadoDeFirma({
  renglon,
}: {
  renglon: NonNullable<VistaRiesgoResidual['acta']>['renglones'][number];
}) {
  if (!renglon.resoluble) {
    return (
      <span
        className="font-semibold text-warn-text"
        title="El área no tiene cargo líder, o ese cargo no tiene ninguna persona activa"
      >
        Sin firmante resoluble
      </span>
    );
  }
  if (!renglon.aprobo) return <span className="text-faint">Pendiente de firma</span>;
  return (
    <span className="text-primary">
      Firmó {renglon.firmante}
      {renglon.registradoPor !== null && (
        <span className="text-faint"> · registró {renglon.registradoPor}</span>
      )}
    </span>
  );
}

function Tarjeta({
  etiqueta,
  valor,
  nota,
  tono,
}: {
  etiqueta: string;
  valor: number | string;
  nota?: string;
  tono?: 'alerta' | 'aviso';
}) {
  return (
    <div
      className={`rounded-campo border px-3 py-2.5 ${
        tono === undefined ? 'border-border-field bg-surface' : 'border-warn-border bg-warn-100'
      }`}
    >
      <p className={`text-10_5 ${tono === undefined ? 'text-faint' : 'text-warn-text'}`}>
        {etiqueta}
      </p>
      <p
        className={`mt-0.5 font-mono text-18 font-semibold ${
          tono === 'alerta' ? 'text-warn-text' : tono === 'aviso' ? 'text-warn-text' : 'text-primary'
        }`}
      >
        {valor}
      </p>
      {nota !== undefined && (
        <p className={`mt-0.5 text-9_5 ${tono === undefined ? 'text-faint' : 'text-warn-text'}`}>
          {nota}
        </p>
      )}
    </div>
  );
}
