# Contenidos de capacitación del SIG

**Fecha:** 2026-08-31
**Para:** carga inicial de los contenidos de tipo `CAPACITACION` del módulo A (`ContenidoSig`)
**Base:** el material que ya existe en `09. SISTEMA INTEGRADO DE GESTION\13. Comunicación y Capacitacion`, el formato `FOR-CAL-09 Evaluación Inducción - Reinducción SGC` y el programa de sensibilización ISO 27001 de marzo a agosto de 2026

---

## Cómo leer este documento

Cada módulo trae exactamente los campos que `ContenidoSig` necesita para existir en la aplicación —código, título, procedimiento origen, duración, si exige evaluación y su nota mínima— más tres cosas que el modelo de datos no captura pero la gente sí necesita: el temario, el material propio de Cuántico, y un video externo de refuerzo.

**Sobre los videos.** Los verifiqué uno por uno en YouTube: título, existencia y número de vistas reales al 31/08/2026. No hay ningún enlace inventado. Cuando un tema no tenía un buen video en español, lo digo en vez de rellenar con cualquier cosa.

**Sobre el material propio.** Es la parte más valiosa y ya la tienes: grabaciones, presentaciones y guías por numeral. El video externo **refuerza**, no reemplaza — para una auditoría, la evidencia de formación es tu material, no un enlace de YouTube.

**Sobre las evaluaciones.** Cinco preguntas de opción múltiple con cuatro opciones, que es el formato de `FOR-CAL-09`. Las del módulo 1 son **las tuyas, textuales**: no las reescribí. Las de los otros ocho módulos son nuevas y hay que revisarlas antes de publicarlas.

---

## CAP-001 · Inducción y reinducción del SGC

| Campo | Valor |
|---|---|
| Procedimiento origen | `FOR-CAL-09` · `POL-EST-01 Política, Alcance y Objetivos de Calidad` |
| Duración | 2 horas |
| Alcance | Todas las personas |
| Periodicidad | Anual, y al ingresar |
| Evaluación | Sí · nota mínima 80 |

**Objetivo.** Que cualquier persona de Cuántico pueda decir en voz alta qué hace la organización, para quién, bajo qué política de calidad y cuál es su parte en el sistema.

**Temario**

1. Quiénes somos: propósito, valores y estructura. El organigrama y el mapa de procesos `MAP-SIG-01 v3.0`.
2. Qué es un sistema de gestión de la calidad y por qué ISO 9001:2015.
3. El alcance del SGC de Cuántico y **por qué el numeral 7.1.5.2 está excluido**, con su justificación técnica.
4. La política y los objetivos de calidad, y cómo se miden con los indicadores.
5. Los nueve procesos y cómo interactúan: entradas, salidas y responsables.
6. Qué se espera de cada persona: registros, evidencias y reporte de mejoras.

**Material propio**

- `Presentación Inducción V4.0.pptx`
- Grabaciones de inducción de 2026 (febrero, marzo, abril, mayo, julio) — sirven de referencia de cómo se dicta
- `MAP-SIG-01 Mapa de procesos V3.0` y `POL-EST-01`

**Video de refuerzo** — [ISO 9001: ¿Qué es y para qué sirve?](https://www.youtube.com/watch?v=yJcrkaojP3M) · 177 mil vistas · el más visto en español para la pregunta de entrada. Alternativa más extensa: [Introducción de la Norma ISO 9001:2015](https://www.youtube.com/watch?v=fzTV-Ebk5Cg) · 188 mil vistas.

**Evaluación** — las cinco preguntas vigentes de `FOR-CAL-09`, sin cambios:

1. ¿Cuál de los siguientes NO es un valor de Cuantico? → *Rentabilidad financiera*
2. El alcance del SGC de Cuantico está relacionado con: → *Asesoramiento y construcción de productos digitales para la industria GovTech*
3. ¿Cuál numeral de ISO 9001:2015 está excluido del alcance? → *7.1.5.2 Trazabilidad de las mediciones*
4. La Política de Calidad de Cuantico se basa en: → *Excelencia, innovación y mejora continua*
5. En desarrollo del Talento Humano, Cuantico busca: → *Formar colaboradores competentes y fomentar un ambiente participativo*

---

## CAP-002 · Fundamentos de seguridad de la información e ISO/IEC 27001:2022

| Campo | Valor |
|---|---|
| Procedimiento origen | `POL-SIG-02 Política de Gobierno de Seguridad de la Información` |
| Duración | 1,5 horas |
| Alcance | Todas las personas |
| Periodicidad | Anual |
| Evaluación | Sí · nota mínima 80 |

**Objetivo.** Que la seguridad de la información deje de sonar a asunto de Tecnología. Confidencialidad, integridad y disponibilidad explicadas con ejemplos del trabajo diario de Cuántico.

**Temario**

1. Qué protege un SGSI y por qué no es lo mismo que ciberseguridad.
2. Las tres dimensiones: confidencialidad, integridad y disponibilidad, con un ejemplo real de cada una.
3. Estructura de ISO/IEC 27001:2022: los numerales 4 a 10 y los 93 controles del Anexo A en sus cuatro dominios.
4. Qué es la Declaración de Aplicabilidad y por qué un control puede «no aplicar».
5. El comité de seguridad de la información de Cuántico y a quién se reporta un incidente.

**Material propio**

- `3. Estructura ISO 27001 - 10-03-2026.pptx` y su grabación
- `7.1. Capacitación Seguridad de la Información - 25-08-2026.mp4`
- `POL-SIG-02` y `POL-SIG-03 Política de Gestión de Activos e Información`

**Video de refuerzo** — [ISO 27001 Fundamentos · Taller Certificación Internacional](https://www.youtube.com/watch?v=CHbqHPLOEU8) · canal SEGURIDAD CERO · 47 mil vistas · cubre la estructura y la evolución hasta la versión 2022, que es lo que necesitas. Para la idea general en cinco minutos: [¿Qué es la norma ISO 27001? · Quanti Lightboard Series](https://www.youtube.com/watch?v=iZNUDnf7QgQ) · 76 mil vistas — **advertencia: es de hace cuatro años y describe la versión 2013**, sirve para el concepto, no para los controles.

**Evaluación propuesta**

1. La confidencialidad de la información significa que: → *Solo accede a ella quien está autorizado*
2. Un archivo que existe pero está corrupto y no se puede abrir es una falla de: → *Integridad*
3. Los controles del Anexo A de ISO/IEC 27001:2022 se agrupan en: → *Cuatro dominios: organizacionales, de personas, físicos y tecnológicos*
4. Un control declarado «no aplica» en la Declaración de Aplicabilidad: → *Debe justificarse por escrito y queda registrado*
5. Si sospechas que tu cuenta fue comprometida, lo primero es: → *Reportarlo de inmediato por el canal definido, aunque no estés seguro*

---

## CAP-003 · Activos de información: identificar, clasificar y etiquetar

| Campo | Valor |
|---|---|
| Procedimiento origen | `POL-SIG-03` · controles A.5.9, A.5.12 y A.5.13 |
| Duración | 1 hora |
| Alcance | Cargo · Líder de proceso, propietarios y custodios |
| Periodicidad | Anual |
| Evaluación | Sí · nota mínima 80 |

**Objetivo.** Que cada líder sepa reconocer los activos de información de su proceso, ponerles propietario y clasificarlos — que es lo que alimenta la matriz MAGERIT y todo el análisis de riesgos.

**Temario**

1. Qué es un activo de información y qué no lo es. Los diez tipos MAGERIT.
2. Propietario y custodio: dos roles distintos, dos responsabilidades distintas.
3. Clasificación: público, privado y confidencial, con el criterio de decisión.
4. Etiquetado: cómo se marca un documento y qué pasa cuando no se marca.
5. Valoración en las tres dimensiones y el umbral que hace que un activo entre al análisis de riesgos.
6. Datos de cliente, datos personales bajo la Ley 1581 y exposición a Internet: las tres banderas del inventario.

**Material propio**

- `7. Gestión de Activos de Información.pptx`
- Guías del programa de sensibilización: `A5.9`, `A5.12 Clasificación`, `A5.13 Etiquetado`
- El inventario real en la aplicación, pantalla de Inventario de activos

**Video de refuerzo** — [Confidencialidad, Integridad y Disponibilidad](https://www.youtube.com/watch?v=Qmnk0XEPdhQ) · 25 mil vistas. Sobre clasificación de activos en español no hay nada bien calificado: los resultados rondan las cien o doscientas vistas y no valen la pena. **Este módulo se dicta con tu material.**

**Evaluación propuesta**

1. El propietario de un activo de información es: → *Quien responde por su valoración y su tratamiento, no necesariamente quien lo opera*
2. Un contrato firmado con un cliente se clasifica normalmente como: → *Confidencial*
3. El valor de un activo en la metodología de Cuántico: → *Se calcula como el mayor de sus valores por dimensión, no se captura a mano*
4. Marcar que un activo «contiene datos personales» sirve para: → *Identificar las obligaciones de la Ley 1581 que le aplican*
5. Un activo cuyo valor queda por debajo del umbral parametrizado: → *No entra al análisis de riesgos, pero sigue en el inventario*

---

## CAP-004 · Phishing e ingeniería social

| Campo | Valor |
|---|---|
| Procedimiento origen | Controles A.6.3 y A.8.7 · `PRO-TEC-02 Procedimiento Seguridad de la Información` |
| Duración | 45 minutos |
| Alcance | Todas las personas |
| Periodicidad | Semestral |
| Evaluación | Sí · nota mínima 80 |

**Objetivo.** Que la gente reconozca un intento de engaño antes de hacer clic, y que reportarlo sea reflejo y no vergüenza.

**Temario**

1. Ingeniería social: por qué el eslabón que se ataca son las personas, no los sistemas.
2. Las cuatro variantes: phishing por correo, vishing por llamada, smishing por SMS y quishing por código QR.
3. Las cinco señales: urgencia, autoridad, remitente parecido pero no idéntico, enlace que no coincide con el texto, y una petición que rompe el procedimiento.
4. El fraude del CEO y la solicitud de cambio de cuenta bancaria de un proveedor — los dos que más dinero cuestan a empresas del tamaño de Cuántico.
5. Qué hacer: no responder, no reenviar, reportar. Y qué hacer si ya hiciste clic.

**Material propio**

- Guía `A8.7 Malware` del programa de sensibilización, mayo de 2026
- `POL-TEC-01 Política de Gestión de Identidades y Control de Acceso`

**Videos de refuerzo**

- [¿Sabes qué es INGENIERÍA SOCIAL?](https://www.youtube.com/watch?v=PN0j35dbG-8) · 48 mil vistas · el concepto, bien explicado y corto.
- [Ejemplo de estafa de vishing (phishing por voz)](https://www.youtube.com/watch?v=nd-7aHJ-vRQ) · 9 mil vistas · un caso real grabado. **Es el que más impacto tiene en una sesión**: la gente reconoce el tono de la llamada.

**Evaluación propuesta**

1. Recibes un correo del CEO pidiendo con urgencia una transferencia por fuera del procedimiento. Lo correcto es: → *Verificar por un canal distinto antes de hacer nada, aunque el remitente parezca correcto*
2. El «quishing» es ingeniería social a través de: → *Códigos QR*
3. La señal más confiable de un correo fraudulento es: → *La combinación de urgencia con una petición que salta el procedimiento normal*
4. Hiciste clic en un enlace sospechoso y luego te diste cuenta. Debes: → *Reportarlo de inmediato: mientras más pronto se sepa, menos daño*
5. Un proveedor conocido escribe pidiendo cambiar su cuenta bancaria. Corresponde: → *Confirmar el cambio llamando al contacto que ya tenías registrado, nunca al del correo*

---

## CAP-005 · Contraseñas, accesos y doble factor

| Campo | Valor |
|---|---|
| Procedimiento origen | `POL-TEC-01` · controles A.5.15 a A.5.18 |
| Duración | 45 minutos |
| Alcance | Todas las personas |
| Periodicidad | Anual |
| Evaluación | Sí · nota mínima 80 |

**Objetivo.** Que nadie comparta una contraseña ni reutilice la del correo personal en una herramienta de trabajo, y que el doble factor esté activo en todas las cuentas.

**Temario**

1. Por qué reutilizar una contraseña es el riesgo más grande y más barato de eliminar.
2. Frases de paso contra contraseñas complicadas: cuál resiste más y cuál se recuerda mejor.
3. El gestor de contraseñas: qué es, por qué no es peligroso concentrarlas, y cómo se usa.
4. Doble factor: qué es, por qué una contraseña robada deja de servir, y cómo se activa.
5. El principio de mínimo privilegio y por qué la revisión trimestral de accesos existe.
6. Qué hacer al desvincularse alguien: la baja de accesos como parte del proceso, no como favor.

**Material propio**

- Guías `A5.17 Información de autenticación` y `A5.18 Derechos de acceso`, julio de 2026, con grabación
- `PRO-TEC-01 Procedimiento Creación y Administración de Usuarios v2.0`

**Video de refuerzo** — **ninguno.** Busqué en español y lo mejor calificado sobre verificación en dos pasos es específico de WhatsApp, que no sirve para un contexto corporativo; los videos sobre gestores de contraseñas que encontré rondan las mil vistas. Este módulo se dicta con tu material y con una demostración en vivo de Microsoft Authenticator, que además es la herramienta real del tenant.

**Evaluación propuesta**

1. La práctica más riesgosa de esta lista es: → *Usar la misma contraseña en una herramienta de trabajo y en un servicio personal*
2. El doble factor protege porque: → *Una contraseña robada ya no alcanza para entrar*
3. Un gestor de contraseñas es recomendable porque: → *Permite una contraseña distinta y larga por servicio sin memorizarlas*
4. Compartir una cuenta entre dos personas del equipo: → *Está prohibido: sin identificación individual no hay trazabilidad*
5. La revisión trimestral de accesos busca: → *Retirar privilegios que ya no corresponden al rol de cada persona*

---

## CAP-006 · Protección de datos personales · Ley 1581 de 2012

| Campo | Valor |
|---|---|
| Procedimiento origen | Control A.5.34 · Ley 1581 de 2012 y decreto 1377 de 2013 |
| Duración | 1 hora |
| Alcance | Todas las personas; obligatorio para Talento Humano, Comercial y Proyectos |
| Periodicidad | Anual |
| Evaluación | Sí · nota mínima 80 |

**Objetivo.** Que quien trate datos personales sepa que los está tratando, con qué autorización y por cuánto tiempo.

**Temario**

1. Qué es un dato personal y qué lo hace **sensible**.
2. Los actores: titular, responsable y encargado. Cuál es Cuántico en cada relación.
3. Los principios: finalidad, libertad, veracidad, transparencia, acceso restringido, seguridad y confidencialidad.
4. La autorización: cuándo se necesita, cómo se prueba, y qué pasa si no existe.
5. Derechos del titular y los plazos legales de respuesta a una consulta o un reclamo.
6. Qué hacer ante un incidente que involucre datos personales, y el deber de reportar a la SIC.
7. Datos personales en los proyectos con entidades públicas: dónde suele fallar.

**Material propio**

- Guía `A5.34 Privacidad y protección de PII`, agosto de 2026, con grabación
- Política de tratamiento de datos personales — **en actualización según la matriz de partes interesadas 2026**, conviene cerrar eso antes de dictar el módulo

**Video de refuerzo** — [Ley estatutaria 1581 de 2012: disposiciones generales para la protección de datos personales](https://www.youtube.com/watch?v=U8OGCJaKORY) · 15 mil vistas · el mejor calificado específico de la ley colombiana.

**Evaluación propuesta**

1. Un dato sensible es aquel que: → *Afecta la intimidad del titular o puede generar discriminación*
2. Cuando Cuántico trata datos de los usuarios finales de un cliente, actúa normalmente como: → *Encargado del tratamiento*
3. La autorización del titular: → *Debe poder probarse; sin prueba, es como si no existiera*
4. Ante un reclamo de un titular: → *Hay plazos legales de respuesta que corren desde la recepción*
5. La finalidad del tratamiento: → *Debe informarse al titular y no puede ampliarse después sin nueva autorización*

---

## CAP-007 · Pensamiento basado en riesgos y la matriz de Cuántico

| Campo | Valor |
|---|---|
| Procedimiento origen | `MAN-CAL-01 Manual de Riesgos y Oportunidades v2.0` · ISO 9001 §6.1 · ISO 31000:2018 |
| Duración | 1,5 horas |
| Alcance | Cargo · Líder de proceso |
| Periodicidad | Anual, antes del comité de riesgos |
| Evaluación | Sí · nota mínima 80 |

**Objetivo.** Que cada líder llegue al comité anual con los riesgos de su proceso identificados, valorados con el método aprobado y con controles que digan algo.

**Temario**

1. Riesgo y oportunidad: la misma matriz, dos tratamientos.
2. Las fuentes: proceso, DOFA, PESTEL y partes interesadas.
3. Los seis factores: legal, operacional, personal, tecnológico, reputacional y externo.
4. Probabilidad e impacto en escala de 1 a 5, con los criterios que ya están escritos en el manual.
5. **La aritmética real**: riesgo inherente = probabilidad × impacto; el control preventivo baja la probabilidad, el correctivo baja el impacto, y la eficacia es 10 %, 40 % u 80 % según sea débil, moderado o fuerte.
6. Los tres niveles y qué obliga cada uno: aceptable, moderado e inaceptable.
7. Cómo se reporta un riesgo materializado con el formato `FOR-CAL-08`.

**Material propio**

- `MAN-CAL-01 Manual de Riesgos y Oportunidades v2.0` y `MAT-CAL-02 v3.0` con sus 66 registros
- `2. Capacitación de Riesgos - 10-02-2025.pdf`
- Comunicado `6. Pensamiento basado en riesgos - 06-04-2026`

**Video de refuerzo** — [Pensamiento Basado en el Riesgo](https://www.youtube.com/watch?v=4qHbSZqHdZM) · 159 mil vistas · el más visto en español sobre el concepto. Es antiguo pero el concepto no ha cambiado; la aritmética específica es de Cuántico y sale del manual, no del video.

**Evaluación propuesta**

1. El riesgo inherente se calcula: → *Multiplicando la probabilidad por el impacto, sin considerar los controles*
2. Un control **preventivo** actúa sobre: → *La probabilidad de que el evento ocurra*
3. Un control calificado como **fuerte** tiene una eficacia de: → *80 %*
4. Un riesgo con valoración inaceptable exige: → *Acciones inmediatas para evitarlo o reducirlo*
5. Cuando un riesgo se materializa: → *Se reporta con el formato FOR-CAL-08 y se evalúa si cambia la matriz*

---

## CAP-008 · No conformidades, causa raíz y acciones correctivas

| Campo | Valor |
|---|---|
| Procedimiento origen | `PRO-CAL-03 Acciones correctivas y oportunidades de mejora` · `PRO-CAL-02 Salidas no conformes` |
| Duración | 1,5 horas |
| Alcance | Cargo · Líder de proceso |
| Periodicidad | Anual |
| Evaluación | Sí · nota mínima 80 |

**Objetivo.** Que la gente distinga corrección de acción correctiva, y que deje de escribir «falta de capacitación» como causa raíz de todo.

**Temario**

1. No conformidad, observación y oportunidad de mejora: qué las separa.
2. **Corrección contra acción correctiva**: apagar el incendio no es lo mismo que evitar el siguiente.
3. Análisis de causa raíz con los cinco porqués: cómo se hace bien y por qué casi siempre se detiene demasiado pronto.
4. Diagrama de Ishikawa: cuándo conviene más que los cinco porqués.
5. La pregunta que la norma obliga: ¿el mismo problema existe en otra parte de la organización?
6. Verificación de eficacia: qué se mira, cuándo, y qué pasa si resultó no eficaz.
7. Salidas no conformes: identificación, control y registro.

**Material propio**

- `PRO-CAL-03` y los formatos `FOR-CAL-02` y `FOR-CAL-03`
- `8. Salidas no conformes - 24-11-2025.pptx` con su grabación

**Videos de refuerzo**

- [Diagrama de Causa-Efecto (Espina de pescado o Ishikawa)](https://www.youtube.com/watch?v=VM8Tz3xHwsM) · 221 mil vistas · el más visto en español sobre el método.
- [¿Cómo aplicar la metodología 5 Porqués?](https://www.youtube.com/watch?v=5WXkRDaMINw) · 37 mil vistas · corto y con ejemplo.
- [8 Claves para Mejorar el Análisis Causa Raíz](https://www.youtube.com/watch?v=ef32zKIRg3U) · 65 mil vistas · para quien ya conoce el método y lo hace mal.

**Evaluación propuesta**

1. Reponer un entregable rechazado por el cliente es: → *Una corrección, no una acción correctiva*
2. La acción correctiva actúa sobre: → *La causa raíz, para que el problema no se repita*
3. «Falta de capacitación» como causa raíz suele indicar: → *Que el análisis se detuvo antes de llegar a la causa real*
4. Antes de cerrar una no conformidad hay que preguntarse: → *Si el mismo problema puede estar ocurriendo en otro proceso*
5. Si la verificación de eficacia resulta negativa: → *La no conformidad sigue abierta y se requiere una acción nueva*

---

## CAP-009 · Auditoría interna: qué esperar cuando te auditan

| Campo | Valor |
|---|---|
| Procedimiento origen | `PRO-CAL-04 Planificación y ejecución de auditorías v3.0` · ISO 19011:2018 |
| Duración | 1 hora |
| Alcance | Todas las personas de los procesos programados |
| Periodicidad | Anual, antes del programa de auditoría |
| Evaluación | Sí · nota mínima 80 |

**Objetivo.** Bajar la ansiedad y subir la calidad de la evidencia. Una auditoría bien atendida es más corta y produce mejores hallazgos.

**Temario**

1. Para qué sirve una auditoría interna y por qué no es una evaluación de desempeño.
2. Los tres tipos: primera, segunda y tercera parte.
3. Cómo se arma el programa anual y cómo se lee el plan de auditoría.
4. Criterio, evidencia y hallazgo: los tres conceptos que hay que distinguir.
5. Los cinco resultados posibles de una nota de auditor: conforme, no conformidad, oportunidad de mejora, requerimiento y fortaleza.
6. Reunión de apertura y de cierre: qué pasa en cada una.
7. Qué se espera del auditado: mostrar la evidencia real, no la ideal. Decir «no lo tengo» cuando no se tiene.
8. Después del informe: los hallazgos van a acciones y el seguimiento hasta el cierre.

**Material propio**

- `PRO-CAL-04 v3.0` y los formatos `FOR-CAL-04`, `FOR-CAL-06` y `FOR-CAL-07`
- `1. Capacitación de Auditoría - 10-02-2025.pdf`
- `2. Preparación Auditoría Interna 2026_17-02-2026.pptx`
- El informe de auditoría interna 2026, que cerró con 0 no conformidades y 15 oportunidades de mejora

**Videos de refuerzo**

- [¿CÓMO HACER UNA AUDITORIA INTERNA? 6 Pasos claves](https://www.youtube.com/watch?v=SATi2IrDPXw) · 104 mil vistas · el más visto en español, buena visión general del ciclo.
- [Elementos clave en Redacción de hallazgos de auditoría ISO 9001](https://www.youtube.com/watch?v=XsC1WlSlVbc) · 4,2 mil vistas · pocas vistas, pero es el único específico de redacción de hallazgos y es exactamente lo que le falta al equipo auditor.

**Evaluación propuesta**

1. Un hallazgo de auditoría es: → *El resultado de comparar la evidencia contra el criterio*
2. El criterio de auditoría es: → *La norma, la política o el procedimiento contra el cual se compara*
3. Si no tienes la evidencia que te piden, lo correcto es: → *Decirlo: inventarla convierte un hallazgo menor en uno grave*
4. Una oportunidad de mejora: → *No es un incumplimiento, pero conviene atenderla*
5. Después de emitido el informe: → *Cada líder levanta las acciones de sus hallazgos y el líder del SIG hace el seguimiento hasta el cierre*

---

## CAP-010 · Control documental del SIG

| Campo | Valor |
|---|---|
| Procedimiento origen | `PRO-CAL-01 Control de documentos del SGC v4.0` |
| Duración | 45 minutos |
| Alcance | Cargo · Líder de proceso |
| Periodicidad | Anual |
| Evaluación | Sí · nota mínima 80 |

**Objetivo.** Que nadie trabaje con una versión obsoleta y que crear o cambiar un documento siga siendo un trámite corto.

**Temario**

1. La codificación: `TIPO-PROCESO-NN` y qué significa cada tipo — política, manual, procedimiento, formato, matriz, protocolo, programa.
2. Elaboración, revisión, aprobación y publicación: quién hace qué.
3. La solicitud de creación, modificación o eliminación y el acta de aprobación.
4. Versionado: cuándo sube una versión y cuándo no.
5. Documentos obsoletos: por qué se conservan y por qué no se borran.
6. La matriz de retención documental `MAT-SIG-04`.

**Material propio**

- `PRO-CAL-01 v4.0` y las plantillas oficiales de política, procedimiento, instructivo, manual y programa
- `4. Gestión Documental_09-04-2026.pptx` con grabación y acta
- `4_Matriz_de_Retención_Documental (MAT_SIG_04) V2.xlsx`

**Video de refuerzo** — no incluyo ninguno. El control documental es específico de cada organización y los videos genéricos en español sobre el tema enseñan prácticas que **no** coinciden con `PRO-CAL-01`. Poner uno confundiría más de lo que ayuda.

**Evaluación propuesta**

1. Antes de usar un formato descargado hace meses, corresponde: → *Verificar en el repositorio que sigue siendo la versión vigente*
2. Un documento obsoleto: → *Se conserva identificado como obsoleto, no se elimina*
3. Para modificar un procedimiento se requiere: → *Solicitud, revisión y aprobación registradas*
4. La codificación `PRO-TEC-01` corresponde a: → *Un procedimiento del proceso de Gestión Tecnológica*
5. La matriz de retención documental define: → *Cuánto tiempo se conserva cada tipo de documento y qué se hace después*

---

## Resumen para cargar en la aplicación

| Código | Título | Alcance | Periodicidad | Video verificado |
|---|---|---|---|---|
| CAP-001 | Inducción y reinducción del SGC | Todas | Anual + ingreso | Sí · 177 mil vistas |
| CAP-002 | Fundamentos de seguridad e ISO 27001:2022 | Todas | Anual | Sí · 47 mil vistas |
| CAP-003 | Activos de información | Líderes de proceso | Anual | Parcial · solo el de CID |
| CAP-004 | Phishing e ingeniería social | Todas | Semestral | Sí · 48 mil y 9 mil vistas |
| CAP-005 | Contraseñas, accesos y doble factor | Todas | Anual | **No** · ver la nota |
| CAP-006 | Protección de datos personales | Todas | Anual | Sí · 15 mil vistas |
| CAP-007 | Pensamiento basado en riesgos | Líderes de proceso | Anual | Sí · 159 mil vistas |
| CAP-008 | NC, causa raíz y acciones correctivas | Líderes de proceso | Anual | Sí · 221 mil, 65 mil y 37 mil vistas |
| CAP-009 | Auditoría interna | Procesos programados | Anual | Sí · 104 mil vistas |
| CAP-010 | Control documental | Líderes de proceso | Anual | **No, a propósito** |

Diez contenidos, de los cuales cuatro son de alcance «todas las personas» y por tanto generan una asignación por persona en cada periodo. Con 34 personas activas, eso son unas 150 asignaciones anuales solo de capacitación — cifra que conviene tener a la vista antes de programarlas todas en el mismo mes.

## Antes de publicar

1. **Las evaluaciones de CAP-002 a CAP-010 son propuestas mías**, no están aprobadas. Revísalas: conozco la norma, pero no las respuestas que Cuántico considera correctas en su contexto.
2. **La política de tratamiento de datos personales está en actualización** según la matriz de partes interesadas. CAP-006 debería dictarse después de cerrarla.
3. Los enlaces de YouTube apuntan a contenido de terceros que puede cambiar o desaparecer. Para la evidencia de auditoría vale tu material propio; el video es refuerzo.
