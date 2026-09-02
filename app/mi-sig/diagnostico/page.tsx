// app/mi-sig/diagnostico/page.tsx
//
// Qué trae MI sesión, y qué permiso deriva la aplicación de ella.
//
// Existe porque la pregunta «¿por qué no veo el SGSI si estoy en el grupo?» no se puede
// responder desde afuera: el Directorio se audita con Graph, y la aplicación registrada no
// tiene permiso para leer grupos ni usuarios. Lo único observable es lo que el token trae,
// y eso solo lo ve la propia sesión.
//
// Muestra únicamente los datos de quien la abre — nunca los de otra persona — así que no
// hace falta permiso para entrar: cualquiera puede ver por qué su propio acceso es el que
// es, que es justamente lo que evita una consulta al administrador por cada duda.

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import EncabezadoSig from '@/app/components/sgsi/EncabezadoSig';
import { GRUPOS, nombreDelRol, rolDesdeGrupos, type Permiso } from '@/lib/sgsi/permisos';

export const dynamic = 'force-dynamic';

/// Qué desbloquea cada permiso, dicho como lo diría la persona y no el modelo de datos.
const QUE_ABRE: Record<Permiso, string> = {
  'misig:ver': 'Ver mis propias tareas en Mi SIG',
  'mejora:reportar': 'Reportar un hallazgo',
  'operacion:ver': 'Ver Operación: obligaciones, tareas, calendario, contenidos y personas',
  'operacion:escribir': 'Crear y editar obligaciones, contenidos y asignaciones',
  'operacion:administrar': 'Prorrogar, anular, reasignar y cerrar tareas de otra persona',
  'mejora:ver': 'Ver hallazgos y el tablero de mejora',
  'mejora:escribir': 'Clasificar hallazgos, registrar causa raíz y acciones',
  'mejora:cerrar': 'Cerrar y anular hallazgos',
  'estrategico:ver': 'Ver partes interesadas, requisitos legales, riesgos, DOFA y PESTEL',
  'estrategico:escribir': 'Registrar y editar la matriz estratégica',
  'estrategico:parametrizar': 'Cambiar escalas, eficacias y niveles del método estratégico',
  'auditoria:ver': 'Ver el programa y las auditorías internas',
  'auditoria:ejecutar': 'Planificar auditorías, registrar notas y emitir informes',
  'auditoria:administrar': 'Administrar el programa anual y los perfiles de auditor',
  'sgsi:ver': 'Ver el inventario de activos y el registro de riesgos',
  'sgsi:escribir': 'Crear y editar activos, controles y amenazas',
  'activo:valorar': 'Valorar activos en las dimensiones de seguridad',
  'riesgo:tratar': 'Registrar madurez del control y plan de tratamiento',
  'parametrizacion:escribir': 'Cambiar escalas, umbrales y catálogos del método MAGERIT',
  'bitacora:ver': 'Consultar la bitácora de auditoría',
  'evidencia:ver': 'Ver evidencias y anexos',
  'evidencia:escribir': 'Aportar evidencias y anexos',
  'personas:administrar': 'Administrar personas y sincronizar el Directorio',
};

const ORDEN = Object.keys(QUE_ABRE) as Permiso[];

export default async function DiagnosticoPage() {
  const session = await getServerSession(authOptions);
  const crudos = session?.user?.grupos;
  const rol = rolDesdeGrupos(crudos);
  const reconocidos = new Set<string>(rol.grupos);

  const sinReclamo = crudos === undefined;
  const reclamoVacio = Array.isArray(crudos) && crudos.length === 0;
  const hayNoReconocidos = Array.isArray(crudos) && crudos.some((g) => !reconocidos.has(g));

  return (
    <div className="flex min-h-screen flex-col bg-app">
      <EncabezadoSig />
      <main className="flex flex-col gap-6 px-8 pt-10 pb-16">
        <header className="flex max-w-[74ch] flex-col gap-2">
          <h1 className="text-24 font-bold text-primary [text-wrap:balance]">
            Por qué tenés el acceso que tenés
          </h1>
          <p className="text-13 text-secondary [text-wrap:pretty]">
            Todo lo que ves acá sale de tu sesión actual. Los permisos no se guardan en la
            aplicación: se derivan de los grupos del Directorio Activo que tu cuenta presenta al
            iniciar sesión.
          </p>
        </header>

        <section className="flex max-w-[74ch] flex-col gap-3 rounded-tarjeta border border-default bg-surface px-5 py-4">
          <h2 className="text-11 font-semibold uppercase tracking-[0.08em] text-label">Tu cuenta</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-13">
            <dt className="text-muted">Nombre</dt>
            <dd className="text-primary">{session?.user?.name ?? 'sin sesión'}</dd>
            <dt className="text-muted">Correo</dt>
            <dd className="text-primary">{session?.user?.email ?? '—'}</dd>
            <dt className="text-muted">Rol derivado</dt>
            <dd className="font-semibold text-primary">{nombreDelRol(rol)}</dd>
          </dl>
        </section>

        <section className="flex max-w-[74ch] flex-col gap-3 rounded-tarjeta border border-default bg-surface px-5 py-4">
          <h2 className="text-11 font-semibold uppercase tracking-[0.08em] text-label">
            Lo que tu token presenta
          </h2>

          {sinReclamo && (
            <div
              className="flex flex-col gap-2 rounded-tarjeta border px-4 py-3"
              style={{ background: 'var(--hf-warn-100)', borderColor: 'var(--hf-warn-border)' }}
            >
              <p className="text-13 font-semibold" style={{ color: 'var(--hf-warn-text)' }}>
                Tu token no trae ningún grupo.
              </p>
              <p className="text-12_5 [text-wrap:pretty]" style={{ color: 'var(--hf-warn-text)' }}>
                No es que estés fuera de los grupos: es que la aplicación registrada en Azure AD
                no está emitiendo la información de grupos en el token. Se corrige en el registro
                de la aplicación, activando el claim de grupos. Mientras no lo emita, toda cuenta
                queda como Colaborador por más grupos que tenga asignados en el Directorio.
              </p>
            </div>
          )}

          {reclamoVacio && (
            <div
              className="flex flex-col gap-2 rounded-tarjeta border px-4 py-3"
              style={{ background: 'var(--hf-warn-100)', borderColor: 'var(--hf-warn-border)' }}
            >
              <p className="text-13 font-semibold" style={{ color: 'var(--hf-warn-text)' }}>
                El token trae la lista de grupos, pero vacía.
              </p>
              <p className="text-12_5 [text-wrap:pretty]" style={{ color: 'var(--hf-warn-text)' }}>
                La aplicación sí emite el claim, así que esta cuenta no pertenece a ningún grupo
                del Directorio. Se resuelve agregándola al grupo que corresponda a su rol.
              </p>
            </div>
          )}

          {Array.isArray(crudos) && crudos.length > 0 && (
            <>
              <ul className="flex flex-col gap-1.5">
                {crudos.map((g) => {
                  const ok = reconocidos.has(g);
                  return (
                    <li
                      key={g}
                      className="flex items-baseline gap-3 border-b border-hairline pb-1.5 last:border-0"
                    >
                      <span
                        className="shrink-0 text-10 font-semibold uppercase tracking-[0.06em]"
                        style={{ color: ok ? 'var(--hf-text-muted)' : 'var(--hf-warn-text-soft)' }}
                      >
                        {ok ? 'reconocido' : 'ignorado'}
                      </span>
                      <code className="min-w-0 break-all text-12 text-primary">{g}</code>
                    </li>
                  );
                })}
              </ul>

              {hayNoReconocidos && (
                <div
                  className="flex flex-col gap-2 rounded-tarjeta border px-4 py-3"
                  style={{ background: 'var(--hf-warn-100)', borderColor: 'var(--hf-warn-border)' }}
                >
                  <p className="text-13 font-semibold" style={{ color: 'var(--hf-warn-text)' }}>
                    Hay identificadores que la aplicación no conoce.
                  </p>
                  <p
                    className="text-12_5 [text-wrap:pretty]"
                    style={{ color: 'var(--hf-warn-text)' }}
                  >
                    Un identificador «ignorado» no otorga nada. Si alguno de ellos corresponde al
                    grupo <strong>Líderes SIG</strong>, hay que registrarlo en la tabla de
                    identificadores de la aplicación. Es el caso típico cuando el Directorio emite
                    identificadores de objeto en lugar de nombres: el tenant está bien, la cuenta
                    está bien, y aun así ninguna pantalla se abre. Copiá los valores de arriba y
                    pasáselos a quien mantiene la aplicación.
                  </p>
                </div>
              )}
            </>
          )}
        </section>

        <section className="flex max-w-[74ch] flex-col gap-3 rounded-tarjeta border border-default bg-surface px-5 py-4">
          <h2 className="text-11 font-semibold uppercase tracking-[0.08em] text-label">
            Lo que podés hacer · {rol.permisos.size} de {ORDEN.length}
          </h2>
          <ul className="flex flex-col">
            {ORDEN.map((p) => {
              const tiene = rol.permisos.has(p);
              return (
                <li
                  key={p}
                  className="flex items-baseline gap-3 border-b border-hairline py-1.5 last:border-0"
                >
                  <span
                    className="w-[2.2rem] shrink-0 text-10 font-semibold uppercase tracking-[0.06em]"
                    style={{ color: tiene ? 'var(--hf-text-secondary)' : 'var(--hf-text-placeholder)' }}
                  >
                    {tiene ? 'sí' : 'no'}
                  </span>
                  <span className={tiene ? 'text-12_5 text-primary' : 'text-12_5 text-placeholder'}>
                    {QUE_ABRE[p]}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <p className="max-w-[74ch] text-11_5 text-muted [text-wrap:pretty]">
          El acceso tiene dos casos y nada más: <strong>Mi SIG</strong>, para toda cuenta de la
          organización, y <strong>el resto del sistema</strong>, para quien pertenece a{' '}
          <strong>Líderes SIG</strong> (también reconocido por su nombre canónico{' '}
          <strong>{GRUPOS.seguridad}</strong>). La aplicación no concede permisos por su cuenta;
          los da el Directorio.
        </p>
      </main>
    </div>
  );
}
