'use client';

// app/scorm/runner/Runner.client.tsx
//
// **Por qué el modelo de datos vive EN MEMORIA acá.** La API de SCORM es SINCRÓNICA:
// `GetValue` devuelve el valor en el mismo turno, y `postMessage` no puede hacer eso. Si el
// shim tuviera que preguntarle al servidor por cada lectura, no habría forma de responderle
// al curso. Por eso el runner recibe el modelo COMPLETO antes de crear el iframe del SCO,
// responde de memoria, y persiste en cada `Commit` y en `Terminate`.
//
// La validación usa el MISMO módulo puro que el servidor (`scorm-modelo.ts`). No es
// duplicación: es el mismo código corriendo en los dos lados, y por eso lo que el curso
// creyó guardar y lo que se guardó no pueden discrepar.

import { useEffect, useRef, useState } from 'react';
import {
  CONFIRMAR_ANTES_DE_INICIALIZAR,
  EXCEPCION_GENERAL,
  FALLO_GENERAL_AL_CONFIRMAR,
  OK,
  VALOR_NO_INICIALIZADO,
  frase,
  indiceDe,
  normalizar,
  validarCommit,
  validarEscritura,
  validarInitialize,
  validarLectura,
  validarTerminate,
} from '@/lib/sig/scorm-modelo';

interface Props {
  origenApp: string;
}

type MensajeDelPlayer =
  | { tipo: 'ESTADO'; modelo: Record<string, string>; entradaUrl: string; soloLectura: boolean }
  | { tipo: 'GUARDADO'; ok: boolean };

export default function Runner({ origenApp }: Props) {
  const [entradaUrl, setEntradaUrl] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const modelo = useRef<Record<string, string>>({});
  const sesion = useRef({ iniciado: false, terminado: false });
  const ultimoError = useRef(OK);
  const diagnostico = useRef('');
  const soloLectura = useRef(false);

  useEffect(() => {
    function conteos() {
      return {
        objetivos: Number(modelo.current['cmi.objectives._count'] ?? '0'),
        interacciones: Number(modelo.current['cmi.interactions._count'] ?? '0'),
      };
    }

    function alPlayer(mensaje: unknown) {
      window.parent.postMessage(mensaje, origenApp);
    }

    function commit(final: boolean) {
      const codigo = final ? OK : validarCommit(sesion.current);
      if (codigo !== OK) {
        ultimoError.current = codigo;
        return 'false';
      }
      if (soloLectura.current) return 'true'; // P12 · `mode=review` no escribe nada.
      alPlayer({ tipo: 'COMMIT', modelo: modelo.current, final });
      return 'true';
    }

    const API = {
      Initialize(_arg: string): string {
        const codigo = validarInitialize(sesion.current);
        ultimoError.current = codigo;
        if (codigo !== OK) return 'false';
        sesion.current.iniciado = true;
        return 'true';
      },
      Terminate(_arg: string): string {
        const codigo = validarTerminate(sesion.current);
        ultimoError.current = codigo;
        if (codigo !== OK) return 'false';
        commit(true);
        sesion.current.terminado = true;
        return 'true';
      },
      GetValue(elemento: string): string {
        const codigo = validarLectura(elemento, sesion.current);
        if (codigo !== OK) {
          ultimoError.current = codigo;
          diagnostico.current = `no se pudo leer «${elemento}»: ${frase(codigo)}`;
          return '';
        }
        const valor = modelo.current[elemento];
        if (valor === undefined) {
          // 403 y no cadena vacía: «no inicializado» y «vacío» son cosas distintas, y un
          // curso que las confunde muestra un progreso que no existe.
          ultimoError.current = VALOR_NO_INICIALIZADO;
          return '';
        }
        ultimoError.current = OK;
        return valor;
      },
      SetValue(elemento: string, valor: string): string {
        const codigo = validarEscritura(elemento, valor, sesion.current, conteos());
        ultimoError.current = codigo;
        if (codigo !== OK) {
          diagnostico.current = `no se pudo fijar «${elemento}» = «${valor}»: ${frase(codigo)}`;
          return 'false';
        }
        modelo.current[elemento] = valor;

        // Los `_count` los mantiene el LMS, no el curso: si el SCO escribió el índice
        // siguiente, la colección creció.
        const indice = indiceDe(elemento);
        if (indice !== null) {
          const normalizado = normalizar(elemento);
          const clave = normalizado.startsWith('cmi.objectives')
            ? 'cmi.objectives._count'
            : normalizado.startsWith('cmi.interactions')
              ? 'cmi.interactions._count'
              : null;
          if (clave !== null && indice + 1 > Number(modelo.current[clave] ?? '0')) {
            modelo.current[clave] = String(indice + 1);
          }
        }
        return 'true';
      },
      Commit(_arg: string): string {
        if (!sesion.current.iniciado) {
          ultimoError.current = CONFIRMAR_ANTES_DE_INICIALIZAR;
          return 'false';
        }
        const r = commit(false);
        if (r === 'true') ultimoError.current = OK;
        else if (ultimoError.current === OK) ultimoError.current = FALLO_GENERAL_AL_CONFIRMAR;
        return r;
      },
      GetLastError(): string {
        return String(ultimoError.current);
      },
      GetErrorString(codigo: string): string {
        return frase(Number(codigo));
      },
      GetDiagnostic(codigo: string): string {
        // El diagnóstico es NUESTRO y va en español: es lo que alguien lee cuando el curso
        // no avanza. `GetErrorString` es del estándar y va en inglés.
        return diagnostico.current === '' ? frase(Number(codigo)) : diagnostico.current;
      },
    };

    (window as unknown as { API_1484_11: typeof API }).API_1484_11 = API;

    function alRecibir(evento: MessageEvent) {
      // P3 · el origen se valida SIEMPRE. Un `origin: '*'` acá es entregarle la API a
      // cualquier página que logre abrir el runner en un iframe.
      if (evento.origin !== origenApp) return;
      const mensaje = evento.data as MensajeDelPlayer;
      if (mensaje.tipo === 'ESTADO') {
        modelo.current = { ...mensaje.modelo };
        soloLectura.current = mensaje.soloLectura;
        setEntradaUrl(mensaje.entradaUrl);
      }
      if (mensaje.tipo === 'GUARDADO' && !mensaje.ok) {
        // El servidor rechazó la escritura: el intento está cerrado o el token venció. El
        // curso tiene que enterarse, o seguiría acumulando avance que no se guarda.
        ultimoError.current = EXCEPCION_GENERAL;
        diagnostico.current = 'el servidor rechazó el guardado: el intento ya no está abierto';
        setAviso('Tu avance dejó de guardarse porque este intento ya se cerró. Volvé a abrir el curso.');
      }
    }

    window.addEventListener('message', alRecibir);
    alPlayer({ tipo: 'LISTO' });

    // P13 · muchos cursos no llaman `Terminate` si se cierra la pestaña. Un commit acá
    // salva el avance de los últimos minutos.
    function alOcultar() {
      if (sesion.current.iniciado && !sesion.current.terminado) commit(false);
    }
    window.addEventListener('pagehide', alOcultar);
    document.addEventListener('visibilitychange', alOcultar);

    return () => {
      window.removeEventListener('message', alRecibir);
      window.removeEventListener('pagehide', alOcultar);
      document.removeEventListener('visibilitychange', alOcultar);
    };
  }, [origenApp]);

  return (
    <div style={{ margin: 0, height: '100vh', overflow: 'hidden' }}>
      {aviso !== null && (
        <p style={{ background: '#fee', color: '#900', padding: '8px', margin: 0 }}>{aviso}</p>
      )}
      {entradaUrl === null ? (
        <p style={{ padding: '16px', fontFamily: 'system-ui' }}>Cargando el curso…</p>
      ) : (
        <iframe
          title="curso"
          src={entradaUrl}
          style={{ width: '100%', height: '100%', border: 0 }}
          allow="fullscreen; autoplay"
        />
      )}
    </div>
  );
}
