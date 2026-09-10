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
  const ultimoModelo = useRef<Record<string, string>>(modelo);
  const [estado, setEstado] = useState('Cargando el curso…');
  const [progreso, setProgreso] = useState(Number(modelo['cmi.progress_measure'] ?? '0'));
  const [inicializado, setInicializado] = useState(false);

  const origenRunner = new URL(runnerUrl).origin;

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
        const r = await guardarIntento(token, mensaje.modelo, mensaje.final);
        setEstado(
          r.ok
            ? `Avance guardado · ${new Date().toLocaleTimeString('es-CO')}`
            : (r.mensaje ?? 'no se pudo guardar'),
        );
        marco.current?.contentWindow?.postMessage({ tipo: 'GUARDADO', ok: r.ok }, origenRunner);
      }
    }

    window.addEventListener('message', alRecibir);
    return () => window.removeEventListener('message', alRecibir);
  }, [entradaUrl, modelo, origenRunner, soloLectura, token]);

  // P13 · commit automático cada 60 s. Muchos cursos no llaman `Terminate` si se cierra la
  // pestaña, y sin esto se perderían los últimos minutos de avance.
  useEffect(() => {
    if (soloLectura) return;
    const reloj = setInterval(() => {
      void guardarIntento(token, ultimoModelo.current, false);
    }, 60_000);
    return () => clearInterval(reloj);
  }, [soloLectura, token]);

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
    <main style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header style={{ padding: '8px 16px', borderBottom: '1px solid #ddd', fontFamily: 'system-ui' }}>
        <progress value={progreso} max={1} style={{ width: '12rem' }} />{' '}
        <span>{Math.round(progreso * 100)} %</span>
        {soloLectura && <strong> · repaso: este intento no se registra</strong>}
        <span style={{ float: 'right', color: '#555' }}>{estado}</span>
      </header>
      <iframe
        ref={marco}
        title="runner del curso"
        src={runnerUrl}
        style={{ flex: 1, border: 0, width: '100%' }}
        allow="fullscreen; autoplay"
      />
    </main>
  );
}
