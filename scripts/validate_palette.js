#!/usr/bin/env node
/**
 * Validador de rampas de color.
 *
 * REQ-SIG-18 criterio 10 lo cita como la herramienta con la que se vuelve a comprobar una
 * rampa cuando alguien cambia un paso. La rampa de la valoracion quedo fijada por una prueba,
 * pero sin este validador nadie podia reverificarla: la spec lo nombraba y el archivo no
 * existia.
 *
 * Uso:
 *   node scripts/validate_palette.js "#93b4e0,#6c95d4,...,#0c2461" \
 *        --mode light --surface "#ffffff" --ordinal
 *
 * Las cuatro comprobaciones:
 *
 *   Lightness monotone   los pasos leen de claro a oscuro sin volver atras. Solo con
 *                        --ordinal: una paleta categorica no tiene por que ordenarse.
 *   Adjacent DeltaL      ningun par contiguo mas cerca que UMBRAL_DELTA_L. Dos pasos que se
 *                        distinguen en el codigo hexadecimal y no en la pantalla son un paso.
 *   Light-end contrast   el paso mas claro contra la superficie. Es la comprobacion que
 *                        rechazo `--hf-brand-100` (#e9f0fb): el segmento del valor 0 habria
 *                        sido invisible sobre el blanco.
 *   Single hue           una rampa ordinal es un tono con distinta luminosidad. Si el tono se
 *                        mueve, deja de leerse como «mas» y empieza a leerse como «otro».
 *
 * La luminosidad y el tono salen de HSL; el contraste, de la luminancia relativa de WCAG 2.
 * Son dos escalas distintas a proposito: el contraste es una razon percibida contra un fondo,
 * y la separacion entre pasos es una distancia dentro de la rampa.
 */

'use strict';

// --- Umbrales -----------------------------------------------------------------------------
// El de DeltaL lo fija REQ-SIG-18 §4.4 («all gaps >= 0.06»). Los otros dos NO estan en la
// spec: los elegi para que la evidencia que la spec si documenta quede del lado correcto
// -#93b4e0 a 2.13:1 pasa, #e9f0fb a 1.15:1 falla, y una dispersion de 9° pasa-. Si el
// criterio real es otro, se cambian aca y en un solo lugar.
const UMBRAL_DELTA_L = 0.06;
const UMBRAL_CONTRASTE_CLARO = 1.5;
const UMBRAL_DISPERSION_TONO = 15;

// --- Color --------------------------------------------------------------------------------

function aRgb(hex) {
  const limpio = String(hex).trim().replace(/^#/, '');
  const completo = limpio.length === 3 ? limpio.split('').map((c) => c + c).join('') : limpio;
  if (!/^[0-9a-fA-F]{6}$/.test(completo)) throw new Error('no es un color hexadecimal: ' + hex);
  const n = parseInt(completo, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/// Luminosidad de HSL, de 0 a 1. Es la que separa los pasos de la rampa.
function luminosidad(c) {
  return (Math.max(c.r, c.g, c.b) + Math.min(c.r, c.g, c.b)) / 2 / 255;
}

/// Tono de HSL en grados. Un gris no tiene tono y devuelve null: meterlo en la dispersion
/// inventaria un angulo que el color no tiene.
function tono(c) {
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  const d = max - min;
  if (d === 0) return null;
  let h;
  if (max === c.r) h = ((c.g - c.b) / d) % 6;
  else if (max === c.g) h = (c.b - c.r) / d + 2;
  else h = (c.r - c.g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/// Luminancia relativa de WCAG 2, para el contraste contra la superficie.
function luminancia(c) {
  const canal = (v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(c.r) + 0.7152 * canal(c.g) + 0.0722 * canal(c.b);
}

function contraste(a, b) {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/// Distancia angular mas corta entre dos tonos: 350° y 10° distan 20, no 340.
function distanciaTono(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// --- Argumentos ---------------------------------------------------------------------------

function leerArgumentos(argv) {
  const posicionales = [];
  const opciones = { mode: 'light', surface: '#ffffff', ordinal: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ordinal') opciones.ordinal = true;
    else if (a === '--mode') opciones.mode = argv[++i];
    else if (a === '--surface') opciones.surface = argv[++i];
    else if (a.startsWith('--')) throw new Error('opcion desconocida: ' + a);
    else posicionales.push(a);
  }
  if (posicionales.length === 0) throw new Error('falta la lista de colores');
  const pasos = posicionales[0].split(',').map((x) => x.trim()).filter(Boolean);
  if (pasos.length < 2) throw new Error('hacen falta al menos dos pasos');
  return { pasos, mode: opciones.mode, surface: opciones.surface, ordinal: opciones.ordinal };
}

// --- Comprobaciones -----------------------------------------------------------------------

function comprobar(opciones) {
  const pasos = opciones.pasos;
  const rgb = pasos.map(aRgb);
  const ls = rgb.map(luminosidad);
  const fondo = aRgb(opciones.surface);
  const resultados = [];

  if (opciones.ordinal) {
    const sube = ls.some((l, i) => i > 0 && l > ls[i - 1] + 1e-9);
    const baja = ls.some((l, i) => i > 0 && l < ls[i - 1] - 1e-9);
    const monotona = !(sube && baja);
    resultados.push({
      nombre: 'Lightness monotone',
      ok: monotona,
      detalle: monotona
        ? 'steps read ' + (baja ? 'light→dark' : 'dark→light')
        : 'steps change direction mid-ramp',
    });

    let peor = Infinity;
    let donde = 0;
    for (let i = 1; i < ls.length; i++) {
      const brecha = Math.abs(ls[i] - ls[i - 1]);
      if (brecha < peor) { peor = brecha; donde = i; }
    }
    const brechasOk = peor >= UMBRAL_DELTA_L;
    resultados.push({
      nombre: 'Adjacent ΔL',
      ok: brechasOk,
      detalle: brechasOk
        ? 'all gaps >= ' + UMBRAL_DELTA_L.toFixed(2)
        : pasos[donde - 1] + ' and ' + pasos[donde] + ' only ' + peor.toFixed(3) + ' apart',
    });
  }

  // El paso mas claro es el unico que puede desaparecer sobre la superficie.
  let masClaro = 0;
  for (let i = 1; i < ls.length; i++) if (ls[i] > ls[masClaro]) masClaro = i;
  const razon = contraste(rgb[masClaro], fondo);
  const contrasteOk = razon >= UMBRAL_CONTRASTE_CLARO;
  resultados.push({
    nombre: 'Light-end contrast',
    ok: contrasteOk,
    detalle: pasos[masClaro] + ' at ' + razon.toFixed(2) + ':1 vs surface' +
      (contrasteOk ? '' : ' (needs ' + UMBRAL_CONTRASTE_CLARO.toFixed(2) + ':1)'),
  });

  const tonos = rgb.map(tono).filter((h) => h !== null);
  if (tonos.length < 2) {
    resultados.push({ nombre: 'Single hue', ok: true, detalle: 'no chromatic steps to compare' });
  } else {
    let dispersion = 0;
    for (let i = 0; i < tonos.length; i++) {
      for (let j = i + 1; j < tonos.length; j++) {
        dispersion = Math.max(dispersion, distanciaTono(tonos[i], tonos[j]));
      }
    }
    const tonoOk = dispersion <= UMBRAL_DISPERSION_TONO;
    resultados.push({
      nombre: 'Single hue',
      ok: tonoOk,
      detalle: 'hue spread ' + Math.round(dispersion) + '°' +
        (tonoOk ? '' : ' (max ' + UMBRAL_DISPERSION_TONO + '°)'),
    });
  }

  return resultados;
}

// --- Salida -------------------------------------------------------------------------------

function principal(argv) {
  let opciones;
  try {
    opciones = leerArgumentos(argv);
  } catch (e) {
    console.error('error: ' + e.message);
    console.error('uso: node scripts/validate_palette.js "#aaa,#bbb,..." [--mode light]' +
      ' [--surface "#ffffff"] [--ordinal]');
    return 2;
  }

  let resultados;
  try {
    resultados = comprobar(opciones);
  } catch (e) {
    console.error('error: ' + e.message);
    return 2;
  }

  const ancho = Math.max.apply(null, resultados.map((r) => r.nombre.length));
  for (const r of resultados) {
    console.log('[' + (r.ok ? 'PASS' : 'FAIL') + '] ' + r.nombre.padEnd(ancho) + '   ' + r.detalle);
  }
  const fallaron = resultados.filter((r) => !r.ok).length;
  console.log(fallaron === 0
    ? '→ ALL CHECKS PASS'
    : '→ ' + fallaron + ' CHECK' + (fallaron > 1 ? 'S' : '') + ' FAILED');
  return fallaron === 0 ? 0 : 1;
}

if (require.main === module) process.exitCode = principal(process.argv.slice(2));

module.exports = { aRgb, luminosidad, tono, luminancia, contraste, distanciaTono, comprobar };
