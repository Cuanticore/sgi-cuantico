'use client';

// app/mi-sig/curso/[asignacionId]/Player.client.tsx
//
// El puente entre el runner (otro origen) y el servidor. Es el único que habla con la base:
// el runner no tiene sesión, y por eso una API robada en el origen de contenido no alcanza
// para escribir nada.

import { useEffect, useRef, useState } from 'react';
import { guardarIntento } from '@/app/mi-sig/acciones/curso';

interface Props {
  token: string;
  modelo: Record<string, string>;
  runnerUrl: string;
  entradaUrl: string;
  soloLectura: boolean;
}

export default function Player({ token, modelo, runnerUrl, entradaUrl, soloLectura }: Props) {
  const marco = useRef<HTMLIFrameElement>(null);
  const pantalla = useRef<HTMLElement>(null);
  const ultimoModelo = useRef<Record<string, string>>(modelo);
  /// El token VIGENTE, que no es el que llegó por props después del primer guardado.
  ///
  /// Va en un `ref` y no en estado: lo leen el manejador de mensajes y el reloj de los 60 s,
  /// los dos dentro de efectos que no se vuelven a montar. Con `useState` cada uno se
  /// quedaría con el token del render en que se creó, que es exactamente el token viejo.
  const tokenVigente = useRef(token);
  const [estado, setEstado] = useState('Cargando el curso…');
  const [progreso, setProgreso] = useState(Number(modelo['cmi.progress_measure'] ?? '0'));
  const [inicializado, setInicializado] = useState(false);
  const [completa, setCompleta] = useState(false);

  const origenRunner = new URL(runnerUrl).origin;

  // PANTALLA COMPLETA.
  //
  // No se puede pedir sola al cargar: el navegador exige un gesto de la persona para
  // `requestFullscreen`, y una llamada sin gesto se rechaza en silencio —quedaría un botón
  // que nunca se probó y una promesa incumplida—. Por eso es un botón, y por eso el estado
  // se lee de `fullscreenchange` y no de haber apretado: se sale con Escape sin avisarnos,
  // y un rótulo que dijera «Salir» sobre una pantalla que ya salió es peor que no tenerlo.
  useEffect(() => {
    const alCambiar = () => setCompleta(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', alCambiar);
    return () => document.removeEventListener('fullscreenchange', alCambiar);
  }, []);

  async function alternarCompleta() {
    try {
      if (document.fullscreenElement === null) {
        await pantalla.current?.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Un navegador puede negarla —una política de permisos, un iframe, un kiosco—. El
      // curso se hace igual sin pantalla completa, así que esto NO puede tumbar al player:
      // lo único que corresponde es que el botón no haga nada.
    }
  }

  useEffect(() => {
    async function alRecibir(evento: MessageEvent) {
      if (evento.origin !== origenRunner) return;
      const mensaje = evento.data as
        | { tipo: 'LISTO' }
        | { tipo: 'COMMIT'; modelo: Record<string, string>; final: boolean };

      if (mensaje.tipo === 'LISTO') {
        marco.current?.contentWindow?.postMessage(
          { tipo: 'ESTADO', modelo, entradaUrl, soloLectura },
          origenRunner,
        );
        return;
      }

      if (mensaje.tipo === 'COMMIT') {
        setInicializado(true);
        ultimoModelo.current = mensaje.modelo;
        setProgreso(Number(mensaje.modelo['cmi.progress_measure'] ?? '0'));
        const r = await guardarIntento(tokenVigente.current, mensaje.modelo, mensaje.final);
        if (r.token !== undefined) tokenVigente.current = r.token;
        setEstado(
          r.ok
            ? `Avance guardado · ${new Date().toLocaleTimeString('es-CO')}`
            : (r.mensaje ?? 'no se pudo guardar'),
        );
        // El motivo viaja al runner. Antes iba sólo `ok`, y el runner tenía que inventarse
        // una causa: decía «este intento ya se cerró» aunque lo que hubiera pasado fuera que
        // venció el token — y mandaba a buscar el problema donde no estaba.
        marco.current?.contentWindow?.postMessage(
          { tipo: 'GUARDADO', ok: r.ok, mensaje: r.mensaje },
          origenRunner,
        );
      }
    }

    window.addEventListener('message', alRecibir);
    return () => window.removeEventListener('message', alRecibir);
  }, [entradaUrl, modelo, origenRunner, soloLectura, token]);

  // P13 · commit automático cada 60 s. Muchos cursos no llaman `Terminate` si se cierra la
  // pestaña, y sin esto se perderían los últimos minutos de avance.
  //
  // Es además lo que mantiene vivo el token: cada guardado aceptado devuelve uno nuevo, así
  // que un curso largo renueva sesenta veces antes de acercarse a la hora de vigencia.
  useEffect(() => {
    if (soloLectura) return;
    const reloj = setInterval(() => {
      void guardarIntento(tokenVigente.current, ultimoModelo.current, false).then((r) => {
        if (r.token !== undefined) tokenVigente.current = r.token;
      });
    }, 60_000);
    return () => clearInterval(reloj);
  }, [soloLectura]);

  // P18 · si el SCO no llamó Initialize en 30 s, algo lo bloqueó: un dominio externo que la
  // CSP no permite, la entrada que no existe, o el servidor sin salida a internet. Se dice.
  useEffect(() => {
    const reloj = setTimeout(() => {
      if (!inicializado) {
        setEstado(
          'El curso no respondió en 30 segundos. Suele ser un dominio externo que la política ' +
            'de contenido no permite —si el paquete es de despacho, necesita salida a internet—, ' +
            'o el archivo de entrada del paquete. Avisá al líder del SIG con el nombre del curso.',
        );
      }
    }, 30_000);
    return () => clearTimeout(reloj);
  }, [inicializado]);

  return (
    // `100dvh` y no `100vh`: en un teléfono la barra del navegador se retrae al desplazar y
    // `vh` deja el curso cortado por abajo justo donde suelen estar los botones de avanzar.
    // El fondo es explícito porque en pantalla completa el navegador pinta negro detrás, y
    // sin él el encabezado queda flotando sobre un vacío que parece un error de carga.
    <main
      ref={pantalla}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        background: '#fff',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '8px 16px',
          borderBottom: '1px solid #ddd',
          fontFamily: 'system-ui',
        }}
      >
        <progress value={progreso} max={1} style={{ width: '12rem' }} />
        <span>{Math.round(progreso * 100)} %</span>
        {soloLectura && <strong>· repaso: este intento no se registra</strong>}
        <span style={{ marginLeft: 'auto', color: '#555' }}>{estado}</span>
        <button
          onClick={alternarCompleta}
          // El avance se sigue guardando igual en pantalla completa —el reloj de P13 no se
          // entera de esto— así que no hay nada que advertir al entrar.
          title={
            completa
              ? 'Salir de pantalla completa (también con Escape)'
              : 'Ver el curso en pantalla completa'
          }
          style={{
            flex: 'none',
            padding: '4px 10px',
            border: '1px solid #ccc',
            borderRadius: '6px',
            background: '#fff',
            fontFamily: 'system-ui',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          {completa ? '⤡ Salir' : '⤢ Pantalla completa'}
        </button>
      </header>
      <iframe
        ref={marco}
        title="runner del curso"
        src={runnerUrl}
        style={{ flex: 1, border: 0, width: '100%' }}
        // `fullscreen` en el iframe es lo que deja que el propio curso pida pantalla
        // completa desde adentro —muchos SCORM traen su botón para el video—. Es
        // independiente del botón de arriba, que agranda el player entero.
        allow="fullscreen; autoplay"
      />
    </main>
  );
}
