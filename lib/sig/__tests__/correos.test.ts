// lib/sig/__tests__/correos.test.ts
//
// Un correo no se puede corregir despues de enviado, asi que lo que se prueba aca es lo
// que seria vergonzoso: el saludo sin nombre, un titulo que rompe la maqueta, un plazo mal
// redactado, y la restriccion que hace que el correo se vea igual en Outlook.

import {
  correoMensualHtml,
  correoSemanalHtml,
  escapar,
  fechaConDia,
  fechaCorta,
  primerNombre,
  textoDePlazo,
  type LineaCorreo,
} from '../correos';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const LINEA = (over: Partial<LineaCorreo> = {}): LineaCorreo => ({
  tipo: 'TAREA',
  titulo: 'Conciliación bancaria de julio',
  fechaLimite: d('2026-08-31'),
  dias: -1,
  ...over,
});

const SEMANAL = {
  nombre: 'Lina Medina Restrepo',
  vencidas: [LINEA({ dias: -6, fechaLimite: d('2026-08-25'), tipo: 'LECTURA' })],
  porVencer: [LINEA({ dias: 1, fechaLimite: d('2026-09-01') })],
  masAdelante: 4,
  desde: d('2026-08-31'),
  hasta: d('2026-09-06'),
  urlMiSig: 'https://sig.cuantico.com/mi-sig',
};

const MENSUAL = {
  nombre: 'Albeiro Gómez',
  areaNombre: 'Talento Humano',
  mes: { anio: 2026, mes: 7 }, // agosto
  cumplimiento: { asignadas: 17, realizadasATiempo: 14, realizadasTarde: 2, pendientes: 1, porciento: 82 },
  deuda: { cantidad: 3, masAntiguaDias: 31 },
  peorCumplimiento: [{ codigo: 'LEC-008', titulo: 'Manual de Riesgos', porciento: 44 }],
  cierresAdministrativos: 2,
  proximoMes: [
    { fecha: d('2026-09-05'), titulo: 'Conciliación bancaria de agosto', personas: 1 },
    { fecha: d('2026-09-15'), titulo: 'Inducción y reinducción del SGC', personas: 34 },
  ],
  urlOperacion: 'https://sig.cuantico.com/sig/obligaciones',
};

describe('primerNombre', () => {
  // El lienzo dice «Hola, Lina», no «Hola, Lina Medina Restrepo»: el nombre completo suena
  // a carta de cobranza.
  it('toma solo el primero', () => {
    expect(primerNombre('Lina Medina Restrepo')).toBe('Lina');
  });

  it('sin nombre devuelve vacio y no revienta', () => {
    expect(primerNombre('   ')).toBe('');
  });
});

describe('escapar', () => {
  // El titulo de un contenido lo escribio una persona. Un `<` suelto rompe la maqueta.
  it('neutraliza el marcado', () => {
    expect(escapar('Política <b>v2</b> & anexos')).toBe(
      'Política &lt;b&gt;v2&lt;/b&gt; &amp; anexos',
    );
  });
});

describe('textoDePlazo', () => {
  it('vencida ayer se dice «ayer», no «hace 1 dias»', () => {
    expect(textoDePlazo(-1, d('2026-08-30'))).toContain('Venció ayer');
  });

  it('vencida hace varios dias los cuenta', () => {
    expect(textoDePlazo(-6, d('2026-08-25'))).toBe('Venció hace 6 días · 25 de agosto');
  });

  it('hoy y mañana tienen su palabra', () => {
    expect(textoDePlazo(0, d('2026-09-02'))).toContain('Vence hoy');
    expect(textoDePlazo(1, d('2026-09-01'))).toContain('Vence mañana');
  });

  it('mas adelante lleva el dia de la semana para ubicarse', () => {
    expect(textoDePlazo(4, d('2026-09-05'))).toBe('Vence en 4 días · sábado 5 de septiembre');
  });
});

describe('fechas', () => {
  it('la corta no lleva año: el correo es de esta semana', () => {
    expect(fechaCorta(d('2026-08-31'))).toBe('31 de agosto');
  });

  it('la larga nombra el dia de la semana', () => {
    expect(fechaConDia(d('2026-08-31'))).toBe('lunes 31 de agosto');
  });
});

describe('correoSemanalHtml', () => {
  const html = correoSemanalHtml(SEMANAL);

  it('saluda por el nombre, que es lo que no hacia', () => {
    expect(html).toContain('Hola, Lina. Esto es lo tuyo de esta semana.');
  });

  it('nombra la semana', () => {
    expect(html).toContain('Semana del 31 de agosto al 6 de septiembre');
  });

  it('lleva las tres cifras de la cabecera', () => {
    expect(html).toContain('Vencidas');
    expect(html).toContain('Esta semana');
    expect(html).toContain('Más adelante');
  });

  it('muestra cada tarea con su tipo y su plazo', () => {
    expect(html).toContain('Conciliación bancaria de julio');
    expect(html).toContain('Lectura');
    expect(html).toContain('Venció hace 6 días');
  });

  // «Un solo llamado a la accion. Ningun boton por tarea: el correo avisa, la bandeja es
  // donde se cierra.» Es una nota explicita del lienzo, y es facil de romper agregando un
  // enlace por fila sin pensarlo.
  it('tiene UN solo enlace, el de la bandeja', () => {
    expect(html.match(/<a\s/g) ?? []).toHaveLength(1);
    expect(html).toContain('Abrir Mi SIG');
  });

  it('el pie explica por que llega, para que el silencio no parezca un fallo', () => {
    expect(html).toContain('Si no tuvieras ninguna pendiente, no te llegaría.');
  });

  it('sin nombre no queda un «Hola, .» colgando', () => {
    const h = correoSemanalHtml({ ...SEMANAL, nombre: '' });
    expect(h).not.toContain('Hola, .');
    expect(h).toContain('Esto es lo tuyo de esta semana.');
  });

  it('sin vencidas no dibuja la seccion roja', () => {
    const h = correoSemanalHtml({ ...SEMANAL, vencidas: [] });
    expect(h).not.toContain('Vencidas · siguen exigibles');
  });
});

describe('correoMensualHtml', () => {
  const html = correoMensualHtml(MENSUAL);

  it('saluda y nombra el mes y el area', () => {
    expect(html).toContain('Albeiro, así cerró agosto en Talento Humano');
  });

  it('el rango del mes termina en su ultimo dia real', () => {
    // Agosto tiene 31.
    expect(html).toContain('Resumen del 1 al 31 de agosto de 2026');
  });

  it('febrero de un año bisiesto termina en 29', () => {
    const h = correoMensualHtml({ ...MENSUAL, mes: { anio: 2028, mes: 1 } });
    expect(h).toContain('del 1 al 29 de febrero de 2028');
  });

  it('lleva el cumplimiento con su detalle', () => {
    expect(html).toContain('82 %');
    expect(html).toContain('14 de 17 realizadas a tiempo');
  });

  it('la deuda dice cuanto lleva abierta la mas antigua', () => {
    expect(html).toContain('Deuda vencida · 3');
    expect(html).toContain('31 días');
  });

  it('un solo dia vencido se dice en singular', () => {
    const h = correoMensualHtml({ ...MENSUAL, deuda: { cantidad: 1, masAntiguaDias: 1 } });
    expect(h).toContain('1 día');
    expect(h).not.toContain('1 días');
  });

  it('lista las peores obligaciones', () => {
    expect(html).toContain('LEC-008');
    expect(html).toContain('44 %');
  });

  it('los cierres administrativos se explican, no solo se cuentan', () => {
    expect(html).toContain('Cierres administrativos · 2');
    expect(html).toContain('no quién la marcó');
  });

  it('tiene UN solo enlace', () => {
    expect(html.match(/<a\s/g) ?? []).toHaveLength(1);
  });

  it('sin cumplimiento calculable muestra una raya, no un cero', () => {
    const h = correoMensualHtml({
      ...MENSUAL,
      cumplimiento: { asignadas: 0, realizadasATiempo: 0, realizadasTarde: 0, pendientes: 0, porciento: null },
    });
    expect(h).toContain('—');
    expect(h).not.toContain('0 %');
  });

  it('sin deuda no dibuja la seccion', () => {
    const h = correoMensualHtml({ ...MENSUAL, deuda: { cantidad: 0, masAntiguaDias: null } });
    expect(h).not.toContain('Deuda vencida');
  });
});

describe('restricciones de cliente de correo', () => {
  const both = [correoSemanalHtml(SEMANAL), correoMensualHtml(MENSUAL)];

  // Ningun cliente aplica hojas externas, y Outlook descarta un `<style>` en el cuerpo.
  it('no hay hoja de estilos ni bloque style: todo va en linea', () => {
    for (const h of both) {
      expect(h).not.toContain('<style');
      expect(h).not.toContain('<link');
    }
  });

  // Un cliente de correo no descarga tipografias: pedir Libre Franklin solo consigue una
  // caida silenciosa a Times.
  it('la pila es la del sistema, no la de la aplicacion', () => {
    for (const h of both) {
      expect(h).toContain("'Segoe UI', Helvetica, Arial, sans-serif");
      expect(h).not.toContain('Libre Franklin');
    }
  });

  it('el ancho es 600 px fijo, que es lo que Outlook centra', () => {
    for (const h of both) expect(h).toContain('width="600"');
  });

  // Outlook usa el motor de Word: no entiende flex ni grid.
  it('no se usa flex ni grid', () => {
    for (const h of both) {
      expect(h).not.toContain('display:flex');
      expect(h).not.toContain('display:grid');
    }
  });
});

describe('correoMensualHtml · lo que vence el mes siguiente', () => {
  const html = correoMensualHtml(MENSUAL);

  // Es lo unico ACCIONABLE del correo: el resumen mira hacia atras, y sin esta lista el
  // lider se enteraba del mes que viene cuando ya iba tarde.
  it('nombra el mes siguiente, no el que cerro', () => {
    expect(html).toContain('Vence en septiembre');
    expect(html).not.toContain('Vence en agosto');
  });

  it('lista cada obligacion con su fecha y a cuanta gente alcanza', () => {
    expect(html).toContain('Conciliación bancaria de agosto');
    expect(html).toContain('5 de septiembre');
    expect(html).toContain('34 personas');
  });

  it('una sola persona va en singular', () => {
    expect(html).toContain('1 persona<');
  });

  // Diciembre cierra el año: el mes siguiente es ENERO, no el mes 12.
  it('el mensual de diciembre apunta a enero', () => {
    const h = correoMensualHtml({ ...MENSUAL, mes: { anio: 2026, mes: 11 } });
    expect(h).toContain('Vence en enero');
  });

  it('sin nada el mes que viene no dibuja la seccion', () => {
    const h = correoMensualHtml({ ...MENSUAL, proximoMes: [] });
    expect(h).not.toContain('Vence en');
  });
});
