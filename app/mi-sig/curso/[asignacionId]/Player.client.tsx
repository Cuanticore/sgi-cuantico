'use client';

// app/mi-sig/curso/[asignacionId]/Player.client.tsx
//
// El puente entre el runner (otro origen) y el servidor. Es el único que habla con la base:
// el runner no tiene sesión, y por eso una API robada en el origen de contenido no alcanza
// para escribir nada.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { declararCursoTerminado, guardarIntento } from '@/app/mi-sig/acciones/curso';

interface Props {
  asignacionId: number;
  token: string;
  modelo: Record<string, string>;
  runnerUrl: string;
  entradaUrl: string;
  soloLectura: boolean;
}

export default function Player({ asignacionId, token, modelo, runnerUrl, entradaUrl, soloLectura }: Props) {
  const router = useRouter();
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
  const [saliendo, setSaliendo] = useState(false);
  const [terminando, setTerminando] = useState(false);

  const origenRunner = new URL(runnerUrl).origin;

  // REQ-SIG-24 · REGISTRAR QUE SE TERMINÓ, Y CONFIAR EN EL REGISTRO.
  //
  // Coursebox no reporta la completitud por SCORM (el despacho corre en un iframe de un tercero
  // y no llama a la API), así que el curso nunca cierra la asignación solo. La persona lo
  // declara acá, y queda anotado como autodeclaración —no como resultado medido—. Se confirma
  // antes, porque es una afirmación sobre uno mismo; y si el curso exige nota, se pide.
  async function marcarTerminado(): Promise<void> {
    if (terminando || soloLectura) return;
    if (!window.confirm('¿Confirmás que terminaste el curso? Se registrará que lo completaste.')) {
      return;
    }
    setTerminando(true);
    try {
      let r = await declararCursoTerminado(asignacionId);
      if (r.requiereNota === true) {
        const texto = window.prompt(`${r.mensaje ?? 'Este curso exige una nota.'}\n\nNota obtenida (0 a 100):`, '');
        if (texto === null) {
          setTerminando(false);
          return;
        }
        const nota = Number(texto.replace(',', '.'));
        if (!Number.isFinite(nota) || nota < 0 || nota > 100) {
          setEstado('La nota debe ser un número entre 0 y 100.');
          setTerminando(false);
          return;
        }
        r = await declararCursoTerminado(asignacionId, nota);
      }
      if (r.ok) {
        router.push('/mi-sig');
        return;
      }
      setEstado(r.mensaje ?? 'No se pudo registrar el curso.');
    } catch {
      setEstado('No se pudo registrar el curso. Intentá de nuevo.');
    }
    setTerminando(false);
  }

  // SALIR Y VOLVER AL SIG. El curso ocupa la pantalla entera —tiene que hacerlo, un SCO se
  // dibuja a sí mismo— y sin esto la única salida era el botón «atrás» del navegador. Guarda
  // el avance antes de irse; si el guardado falla NO atrapa a la persona en el curso, se va
  // igual. Es un `<a href>` real, así que sigue llevando a Mi SIG aunque el JavaScript falle.
  async function salirYGuardar(evento: { preventDefault: () => void }): Promise<void> {
    evento.preventDefault();
    if (saliendo) return;
    setSaliendo(true);
    try {
      if (!soloLectura) {
        await guardarIntento(tokenVigente.current, ultimoModelo.current, false);
      }
    } catch {
      // Volver al SIG es más importante que este último guardado: el reloj de 60 s ya
      // salvó casi todo, y quedarse en el curso porque el guardado falló es el peor final.
    }
    // Al desmontarse el player, el navegador sale solo de pantalla completa —el elemento que
    // la pedía deja de existir—, así que no hay que salir de ella a mano.
    router.push('/mi-sig');
  }

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
        {/* Marca Cuantico: el curso lo sirve un tercero y ocupa toda la pantalla, así que sin
            esto la persona pierde la referencia de que sigue dentro del SIG. El logo transparente
            va sobre el header blanco. `alt` en español porque es lo que lee un lector de pantalla. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo%20transparente.png"
          alt="Cuantico"
          style={{ flex: 'none', height: '26px', width: 'auto', objectFit: 'contain' }}
        />
        <a
          href="/mi-sig"
          onClick={(e) => void salirYGuardar(e)}
          title="Guardar el avance y volver a Mi SIG"
          style={{
            flex: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 10px',
            border: '1px solid #ccc',
            borderRadius: '6px',
            background: '#fff',
            color: '#1f2937',
            textDecoration: 'none',
            fontFamily: 'system-ui',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            opacity: saliendo ? 0.6 : 1,
          }}
        >
          ← {saliendo ? 'Saliendo…' : soloLectura ? 'Salir' : 'Salir y guardar'}
        </a>
        {/* REQ-SIG-24 · en repaso (`soloLectura`) la asignación ya está cerrada: no hay nada
            que declarar. Sólo aparece mientras el curso está abierto de verdad. */}
        {!soloLectura && (
          <button
            onClick={() => void marcarTerminado()}
            disabled={terminando}
            title="Registrar que terminaste el curso"
            style={{
              flex: 'none',
              padding: '4px 12px',
              border: '1px solid #0b5c44',
              borderRadius: '6px',
              background: terminando ? '#7fae9e' : '#0b7a5a',
              color: '#fff',
              fontFamily: 'system-ui',
              fontSize: '12px',
              fontWeight: 600,
              cursor: terminando ? 'default' : 'pointer',
            }}
          >
            {terminando ? 'Registrando…' : '✓ Terminé el curso'}
          </button>
        )}
        {/* El % SÓLO se muestra si el curso de verdad reporta avance. Un paquete de DESPACHO
            —el contenido lo entrega un tercero como Coursebox— no llama `SetValue(progress_
            measure)`: se queda en 0 para siempre y un «0 %» fijo confunde («¿no guardó?»). Un
            paquete AUTOCONTENIDO sí puede reportarlo, y entonces `progreso > 0` y la barra
            aparece. Verificado el 18/09/2026: Coursebox no reporta avance por SCORM. */}
        {progreso > 0 && (
          <>
            <progress value={progreso} max={1} style={{ width: '12rem' }} />
            <span>{Math.round(progreso * 100)} %</span>
          </>
        )}
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
