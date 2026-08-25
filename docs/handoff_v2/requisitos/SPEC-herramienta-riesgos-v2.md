# SPEC — Herramienta de Gestión de Activos y Riesgos (SGSI Cuántico)

> Documento de especificación para desarrollo asistido. Colócalo en la raíz del repositorio junto con
> `MATRIZ MAGERIT - Activos y Riesgos.xlsx` (prototipo funcional, juego de datos y criterio de aceptación)
> y `MET-SIG-01 Metodologia de analisis y valoracion de riesgos v2.docx` (metodología aprobada).
>
> **Regla de oro:** el Excel es la fuente de verdad funcional. Si algo de esta spec y el Excel discrepan,
> gana el Excel y se levanta la discrepancia antes de codificar.

---

## 0. Contexto en una página

Cuántico es un proveedor SaaS colombiano (sector GovTech). Su SGSI sigue ISO/IEC 27001:2022 y adopta
**MAGERIT v3.0** como metodología de análisis de riesgos, con dos desviaciones declaradas:

1. Trabaja con **tres dimensiones** (Disponibilidad, Integridad, Confidencialidad) en lugar de las cinco de la norma.
   Cuatro amenazas dirigidas a Autenticidad o Trazabilidad se reasignan a Integridad: `E.3`, `A.3`, `A.5`, `A.13`.
2. La escala de valor de los activos es **0 a 5**, no 0 a 10. Los umbrales se reescalaron en la misma proporción.

Estado actual: **234 activos**, **57 amenazas**, **93 controles**, **2.256 riesgos** calculados en Excel.

---

## 1. Modelo de cálculo (no negociable)

Notación: `a` activo, `t` amenaza, `d` dimensión.

```
valor(a)            = max{ v_D(a), v_I(a), v_C(a) }
impacto_d(a,t)      = v_d(a) * degradacion_d(t)
impacto(a,t)        = max{ impacto_D, impacto_I, impacto_C }
riesgo(a,t)         = impacto(a,t) * aro(t)
aro_residual(a,t)   = aro(t) * (1 - eficacia(madurez_control(a,t)))
riesgo_residual(a,t)= impacto(a,t) * aro_residual(a,t)
```

Notas obligatorias:

- **Solo se modela el efecto preventivo de los controles**: la eficacia reduce la frecuencia, no el impacto.
  Los controles que limitan el daño se reflejan bajando la `degradacion` de la amenaza.
- Un activo entra al análisis si `valor(a) >= umbral_valoracion` (parámetro global, hoy `4`).
- Los riesgos de un activo son el **producto cartesiano** del activo por las amenazas aplicables a su
  **tipo MAGERIT**. No se eligen a mano.

---

## 2. Regla de codificación de activos

```
formato : AAA-TTT-NNNN
regex   : ^[A-Z]{3}-[A-Z]{3}-[0-9]{4}$
ejemplos: TEC-APP-0007 · FIN-DAT-0031 · TAL-PER-0004 · TEC-CLA-0012
```

- `AAA` = prefijo del área (parametrizable, 3 letras, único)
- `TTT` = abreviatura del tipo MAGERIT (parametrizable, 3 letras)
- `NNNN` = consecutivo **por combinación (área, tipo)**, 4 dígitos, base 1

### Prefijos de área (seed)

| Prefijo | Área o proceso |
|---|---|
| EST | Gestión Estratégica |
| COM | Gestión Comercial |
| PRY | Gestión de Proyectos |
| SAC | Soporte y Servicio al Cliente |
| TAL | Talento Humano |
| LEG | Gestión Legal y Compras |
| TEC | Gestión Tecnológica |
| SIG | Sistema Integrado de Gestión |
| FIN | Gestión Financiera |
| TRA | Transversal |

### Abreviaturas de tipo (seed)

| MAGERIT | Tipo | Abrev. |
|---|---|---|
| `[D]` | Datos / Información | DAT |
| `[K]` | Claves criptográficas | CLA |
| `[S]` | Servicios | SER |
| `[SW]` | Aplicaciones (software) | APP |
| `[HW]` | Equipamiento informático | EQU |
| `[COM]` | Redes de comunicaciones | RED |
| `[Media]` | Soportes de información | SOP |
| `[AUX]` | Equipamiento auxiliar | AUX |
| `[L]` | Instalaciones | INS |
| `[P]` | Personal | PER |

### Comportamiento

1. Lo genera el sistema; nunca editable desde la UI.
2. **Inmutable**: si el activo cambia de área o tipo, el código no cambia. El cambio va a la bitácora.
3. **No reutilizable**: la baja retira el código; el consecutivo no retrocede.
4. Único global.
5. Cada activo conserva `codigo_heredado` con el identificador del Excel (`LCO-01`, `TEC-008`, `GH-023`).
6. La generación debe ser **segura ante concurrencia** (secuencia por par área-tipo con bloqueo o
   `INSERT ... RETURNING` sobre una tabla de contadores; no `MAX()+1` sin bloqueo).

---

## 3. Entidades parametrizables

Ninguna de estas listas puede estar hardcodeada. Todas son tablas con CRUD, orden, estado activo/inactivo,
color donde aplique, e historial de cambios.

**Catálogos normativos** (se cargan con los valores oficiales y se marcan `es_normativo = true`):
`tipo_activo` (10) · `subtipo_activo` (137) · `amenaza` (57) · `control` (93) ·
`amenaza_tipo` · `amenaza_degradacion` · `amenaza_control`

**Escalas y umbrales**:
`dimension` · `escala_valor` · `escala_degradacion` · `escala_frecuencia` · `escala_madurez` ·
`umbral_impacto` · `umbral_riesgo` · `zona_riesgo` · `criterio_aceptacion`

**Catálogos organizacionales**:
`area` · `ubicacion` · `entorno` · `proveedor` · `cargo` · `clasificacion` · `tratamiento` ·
`estado_tratamiento` · `parametro`

### Reglas
- Los registros operativos guardan **referencia al nivel** (`escala_valor_id`), nunca el número.
  Cambiar «Alto» de 4 a 8 recalcula todo sin reescribir datos.
- Toda escala expone: `orden`, `etiqueta` (texto completo mostrado al usuario), `valor` numérico, `color`.
- La UI muestra **siempre la etiqueta completa**: `"4 — Alto"`, `"[D] Datos / Información"`,
  `"[source] Código fuente"`. Nunca un número suelto ni una sigla sin descripción.
- Desactivar una dimensión no borra historial.
- Cambios de umbral exigen motivo y quedan ligados a la siguiente línea base.

### Seeds de escalas (estado actual)

```yaml
escala_valor:            # 0..5
  - {orden: 6, etiqueta: "5 — Muy Alto",    valor: 5}
  - {orden: 5, etiqueta: "4 — Alto",        valor: 4}
  - {orden: 4, etiqueta: "3 — Medio",       valor: 3}
  - {orden: 3, etiqueta: "2 — Bajo",        valor: 2}
  - {orden: 2, etiqueta: "1 — Muy Bajo",    valor: 1}
  - {orden: 1, etiqueta: "0 — Irrelevante", valor: 0}

escala_degradacion:
  - {etiqueta: "Muy alta",  fraccion: 1.00}
  - {etiqueta: "Alta",      fraccion: 0.80}
  - {etiqueta: "Media",     fraccion: 0.50}
  - {etiqueta: "Baja",      fraccion: 0.20}
  - {etiqueta: "Muy baja",  fraccion: 0.05}
  - {etiqueta: "No aplica", fraccion: 0.00}

escala_frecuencia:       # ARO
  - {etiqueta: "Muy alta — ocurre a diario",                 aro: 100}
  - {etiqueta: "Alta — ocurre cada mes",                     aro: 10}
  - {etiqueta: "Media — ocurre una vez al año",              aro: 1}
  - {etiqueta: "Baja — ocurre cada varios años",             aro: 0.1}
  - {etiqueta: "Muy baja — excepcional, cada muchos años",   aro: 0.01}

escala_madurez:          # CMM
  - {nivel: "L0", nombre: "Inexistente",                 eficacia: 0.00}
  - {nivel: "L1", nombre: "Inicial / ad hoc",            eficacia: 0.10}
  - {nivel: "L2", nombre: "Reproducible pero intuitivo", eficacia: 0.50}
  - {nivel: "L3", nombre: "Proceso definido",            eficacia: 0.90}
  - {nivel: "L4", nombre: "Gestionado y medible",        eficacia: 0.95}
  - {nivel: "L5", nombre: "Optimizado",                  eficacia: 1.00}

umbral_impacto:          # sobre impacto acumulado 0..5
  - {nivel: "Muy alto",     desde: 4.5, hasta: 5}
  - {nivel: "Alto",         desde: 3.0, hasta: 4.4999}
  - {nivel: "Medio",        desde: 1.5, hasta: 2.9999}
  - {nivel: "Bajo",         desde: 0.5, hasta: 1.4999}
  - {nivel: "Despreciable", desde: 0.0, hasta: 0.4999}

umbral_riesgo:           # sobre impacto * aro
  - {nivel: "Crítico", desde: 25,  hasta: 999999}
  - {nivel: "Alto",    desde: 5,   hasta: 24.9999}
  - {nivel: "Medio",   desde: 0.5, hasta: 4.9999}
  - {nivel: "Bajo",    desde: 0,   hasta: 0.4999}

zona_riesgo:
  - {nombre: "Zona 1 — Crítica",                       regla: "impacto >= 3 AND aro >= 1"}
  - {nombre: "Zona 4 — Catastrófica poco probable",    regla: "impacto >= 3 AND aro < 1"}
  - {nombre: "Zona 3 — Asumible",                      regla: "impacto < 1.5 AND aro < 1"}
  - {nombre: "Zona 2 — Atención",                      regla: "resto"}

parametro:
  umbral_valoracion: 4
  periodicidad_revision_completa: "anual"
  periodicidad_revision_parcial: "trimestral"
  zona_horaria: "America/Bogota"
```

---

## 4. Esquema de datos propuesto (PostgreSQL, orientativo)

```sql
-- ---------- catálogos ----------
create table area (
  id serial primary key,
  prefijo char(3) not null unique check (prefijo ~ '^[A-Z]{3}$'),
  nombre text not null unique,
  lider_cargo_id int references cargo(id),
  activo boolean not null default true,
  orden int not null default 0
);

create table tipo_activo (
  id serial primary key,
  codigo text not null unique,          -- '[D]', '[SW]', ...
  nombre text not null,
  abreviatura char(3) not null unique,  -- 'DAT', 'APP', ...
  es_normativo boolean not null default true,
  activo boolean not null default true,
  orden int not null default 0
);

create table subtipo_activo (
  id serial primary key,
  tipo_activo_id int not null references tipo_activo(id),
  codigo text not null,                 -- '[files]'
  nombre text not null,
  es_normativo boolean not null default true,
  activo boolean not null default true,
  unique (tipo_activo_id, codigo)
);

create table dimension (
  id serial primary key,
  codigo char(1) not null unique,       -- 'D','I','C' (y 'A','T' si se reactivan)
  nombre text not null,
  activa boolean not null default true,
  orden int not null default 0
);

create table escala_valor (
  id serial primary key, orden int not null,
  etiqueta text not null unique, valor numeric(6,3) not null, color char(6)
);
create table escala_degradacion (
  id serial primary key, orden int not null,
  etiqueta text not null unique, fraccion numeric(5,4) not null, lectura text, color char(6)
);
create table escala_frecuencia (
  id serial primary key, orden int not null,
  etiqueta text not null unique, aro numeric(10,4) not null, lectura text, color char(6)
);
create table escala_madurez (
  id serial primary key, orden int not null,
  nivel text not null unique, nombre text not null, eficacia numeric(5,4) not null, lectura text
);
create table umbral_impacto (
  id serial primary key, nivel text not null, desde numeric(8,4), hasta numeric(8,4), color char(6)
);
create table umbral_riesgo (
  id serial primary key, nivel text not null, desde numeric(12,4), hasta numeric(12,4), color char(6)
);

-- ---------- amenazas y controles ----------
create table amenaza (
  id serial primary key,
  codigo text not null unique,          -- 'N.1','I.*','A.30'  (ojo: '*' literal)
  nombre text not null,
  grupo text not null,
  nota_aplicacion text,
  frecuencia_id int not null references escala_frecuencia(id),
  es_normativa boolean not null default true,
  activa boolean not null default true
);
create table amenaza_tipo (            -- aplicabilidad: genera los riesgos
  amenaza_id int references amenaza(id),
  tipo_activo_id int references tipo_activo(id),
  primary key (amenaza_id, tipo_activo_id)
);
create table amenaza_degradacion (
  amenaza_id int references amenaza(id),
  dimension_id int references dimension(id),
  degradacion_id int not null references escala_degradacion(id),
  primary key (amenaza_id, dimension_id)
);
create table control (
  id serial primary key,
  codigo text not null unique,          -- 'A.8.13'
  nombre text not null, dominio text not null,
  es_normativo boolean not null default true
);
create table amenaza_control (
  amenaza_id int references amenaza(id),
  control_id int references control(id),
  primary key (amenaza_id, control_id)
);

-- ---------- inventario ----------
create table contador_codigo (          -- consecutivo seguro por (área, tipo)
  area_id int not null references area(id),
  tipo_activo_id int not null references tipo_activo(id),
  ultimo int not null default 0,
  primary key (area_id, tipo_activo_id)
);

create table activo (
  id serial primary key,
  codigo text not null unique check (codigo ~ '^[A-Z]{3}-[A-Z]{3}-[0-9]{4}$'),
  codigo_heredado text,
  nombre text not null,
  descripcion text,
  area_id int not null references area(id),
  tipo_activo_id int not null references tipo_activo(id),
  subtipo_activo_id int not null references subtipo_activo(id),
  propietario_cargo_id int not null references cargo(id),
  custodio_cargo_id int not null references cargo(id),
  ubicacion_id int references ubicacion(id),
  entorno_id int references entorno(id),
  proveedor_id int references proveedor(id),
  clasificacion_id int references clasificacion(id),
  tiene_datos_cliente text check (tiene_datos_cliente in ('Sí','No','Por definir')),
  tiene_datos_personales text check (tiene_datos_personales in ('Sí','No','Por definir')),
  expuesto_internet text check (expuesto_internet in ('Sí','No','Por definir')),
  cantidad int default 1,
  activo boolean not null default true,   -- baja lógica
  creado_en timestamptz not null default now()
);

create table activo_valor (            -- valoración por dimensión
  activo_id int references activo(id),
  dimension_id int references dimension(id),
  escala_valor_id int not null references escala_valor(id),
  primary key (activo_id, dimension_id)
);

create table activo_dependencia (
  activo_id int references activo(id),
  depende_de_id int references activo(id),
  primary key (activo_id, depende_de_id),
  check (activo_id <> depende_de_id)
);

-- ---------- riesgos ----------
create table riesgo (
  id serial primary key,
  activo_id int not null references activo(id),
  amenaza_id int not null references amenaza(id),
  madurez_id int not null references escala_madurez(id),
  -- excepciones puntuales (null = hereda de la amenaza)
  frecuencia_id int references escala_frecuencia(id),
  justificacion_excepcion text,
  responsable_cargo_id int references cargo(id),
  tratamiento_id int references tratamiento(id),
  estado_id int references estado_tratamiento(id),
  observacion text,
  obsoleto boolean not null default false,
  unique (activo_id, amenaza_id)
);
create table riesgo_degradacion (       -- excepción por dimensión; null = hereda
  riesgo_id int references riesgo(id),
  dimension_id int references dimension(id),
  degradacion_id int references escala_degradacion(id),
  primary key (riesgo_id, dimension_id)
);

create table plan_tratamiento (
  id serial primary key,
  riesgo_id int not null references riesgo(id),
  accion text not null,
  responsable_cargo_id int references cargo(id),
  fecha_objetivo date,
  evidencia_url text,
  estado_id int references estado_tratamiento(id)
);

-- ---------- gobierno ----------
create table linea_base (
  id serial primary key, nombre text not null, fecha date not null,
  creada_por text not null, snapshot jsonb not null
);
create table bitacora (
  id bigserial primary key, tabla text not null, registro_id text not null,
  campo text, valor_anterior text, valor_nuevo text,
  usuario text not null, ocurrido_en timestamptz not null default now()
);
```

**Vista de cálculo** (o columnas generadas / materialized view refrescada):

```sql
create view v_riesgo as
select r.id, a.codigo, a.nombre, ar.nombre as area, t.codigo as tipo, am.codigo as amenaza,
       impacto.valor            as impacto,
       impacto.valor * f.aro    as riesgo_potencial,
       f.aro * (1 - m.eficacia) as aro_residual,
       impacto.valor * f.aro * (1 - m.eficacia) as riesgo_residual
from riesgo r
join activo a  on a.id = r.activo_id
join area ar   on ar.id = a.area_id
join tipo_activo t on t.id = a.tipo_activo_id
join amenaza am on am.id = r.amenaza_id
join escala_frecuencia f on f.id = coalesce(r.frecuencia_id, am.frecuencia_id)
join escala_madurez m on m.id = r.madurez_id
join lateral (
  select max(ev.valor * ed.fraccion) as valor
  from activo_valor av
  join dimension d on d.id = av.dimension_id and d.activa
  join escala_valor ev on ev.id = av.escala_valor_id
  left join riesgo_degradacion rd on rd.riesgo_id = r.id and rd.dimension_id = d.id
  join amenaza_degradacion ad on ad.amenaza_id = am.id and ad.dimension_id = d.id
  join escala_degradacion ed on ed.id = coalesce(rd.degradacion_id, ad.degradacion_id)
  where av.activo_id = a.id
) impacto on true
where not r.obsoleto and a.activo;
```

---

## 5. Módulos

| Módulo | Contenido |
|---|---|
| Inventario | CRUD de activos, código automático, listas dependientes tipo→subtipo, detección de duplicados, dependencias, baja lógica |
| Generador de riesgos | Por área/tipo/subtipo: qué activos requieren valoración, cuántas filas les faltan, y acción de generarlas |
| Valoración y tratamiento | Madurez del control por riesgo, cálculo en vivo, plan, responsable, fechas, evidencia, edición masiva por filtro |
| Tablero | KPIs filtrables por área: activos, valorados, riesgos, Alto/Crítico inherente y residual, por tipo, por grupo de amenaza, por madurez, top 10 amenazas |
| Matrices | Mapas de calor inherente y residual (nivel de impacto × frecuencia), con drill-down a la lista de riesgos de cada casilla |
| Administración | CRUD de las entidades de la sección 3, con historial y «restaurar valores normativos» |
| Import / export | Importación desde el Excel con validación previa y reporte de diferencias; export a Excel espejo, PDF y Declaración de Aplicabilidad |
| Auditoría | Bitácora inmutable, líneas base y comparación entre dos |
| Usuarios | SSO Microsoft 365 (OIDC) y RBAC |

### Roles

| Rol | Permisos |
|---|---|
| Administrador | Parámetros y catálogos. No aprueba riesgos |
| Líder del SIG | Lectura y escritura en todo el módulo de riesgos |
| Propietario de activo | Escritura sobre sus activos |
| Custodio | Madurez de controles de sus activos |
| Comité del SIG | Aprobación de tratamientos y aceptaciones; lectura total |
| Auditor | Solo lectura, incluida la bitácora |

---

## 6. No funcionales

- **Seguridad**: OIDC con Microsoft 365; RBAC verificado en el servidor, no solo en la UI; cifrado en tránsito y reposo; sin secretos en el repo.
- **Trazabilidad**: bitácora inmutable; sin borrado físico; toda baja es lógica.
- **Rendimiento**: tablero y matrices < 2 s con 20.000 riesgos; recálculo masivo tras cambio de escala < 30 s.
- **Respaldo**: diario, retención 30 días, prueba de restauración documentada.
- **Formato**: es-CO, coma decimal, `dd/mm/aaaa`, `America/Bogota`.
- **Accesibilidad**: el color nunca es el único portador de información en los mapas de calor.
- **Despliegue**: Docker; configuración por variables de entorno.
- **Pruebas**: cobertura obligatoria sobre motor de cálculo, generación de códigos y generación de riesgos.

---

## 7. Criterios de aceptación

| # | Criterio | Verificación |
|---|---|---|
| 1 | Paridad de datos | Tras importar: 234 activos y 2.256 riesgos, con idéntica distribución por nivel |
| 2 | Paridad de cálculo | 50 riesgos al azar: impacto, riesgo potencial y residual coinciden con el Excel a 2 decimales |
| 3 | Códigos | Los 234 activos tienen código válido, único, y conservan `codigo_heredado` |
| 4 | Generación | Un activo nuevo con valor ≥ 4 genera exactamente las amenazas de su tipo |
| 5 | Parametrización | Cambiar la escala 0–5 → 0–10 desde la UI recalcula todo sin desplegar |
| 6 | Trazabilidad | Todo cambio queda en bitácora con usuario, fecha y valor anterior |
| 7 | Permisos | Rol Auditor no puede escribir, comprobado por llamada directa a la API |
| 8 | Exportación | El Excel exportado abre sin errores y sus fórmulas y listas funcionan |

---

## 8. Fases

1. **Cimientos** — modelo de datos, catálogos normativos, generación de códigos, auth y roles.
2. **Inventario** — módulo de activos + importación desde Excel.
3. **Motor de riesgos** — generación automática y cálculo. *Aquí debe automatizarse la prueba de paridad con el Excel.*
4. **Tratamiento y tablero** — plan, tablero filtrable, matrices.
5. **Administración y auditoría** — parametrización en caliente, bitácora, líneas base, exportaciones.

---

---

## 9. Relevancia de los controles frente a cada amenaza

> **Esta sección cambia el modelo de datos y el motor de cálculo. Léela antes de implementar `amenaza_control`.**

### 9.1 El problema

Una amenaza es mitigada por varios controles con madurez distinta. Ejemplo real: una fuga de
información la contienen Concienciación, Políticas, Seguridad de redes y DLP. Si se promedia
la eficacia de los cuatro, un DLP en L1 queda enmascarado por tres controles en L4 y el riesgo
residual sale falsamente bajo.

Comportamiento de cada método de agregación sobre ese mismo ejemplo:

| Escenario | Media | Mínimo | Ponderada | **Ponderada acotada** |
|---|---|---|---|---|
| Todos maduros | 91,2 % | 90,0 % | 91,3 % | **91,3 %** |
| DLP en L2, resto bien | 81,2 % | 50,0 % | 76,2 % | **55,0 %** |
| DLP en L1, resto excelente | 73,8 % | 10,0 % | 63,1 % | **15,0 %** |
| DLP en L4, resto en L1 | 31,3 % | 10,0 % | 41,9 % | **41,9 %** |

- **Composición probabilística** `1 − ∏(1 − eᵢ)`: **prohibida**. Da 99,995 % con cuatro controles en L3.
  La eficacia de MAGERIT no es una probabilidad de bloqueo independiente sino un grado de calidad de
  implementación; controles operados por la misma organización comparten modos de fallo.
- **Media simple**: oculta el eslabón débil. Es lo que hay hoy y hay que reemplazarlo.
- **Mínimo puro**: demasiado brutal. Un control administrativo mal calificado tumba toda la evaluación
  aunque el control principal esté en L4.

### 9.2 La regla a implementar

```
e(t) = MIN(  Σ(pesoᵢ × eficaciaᵢ) / Σ(pesoᵢ)  ,  eficacia_principal + δ  )
```

con `δ = 0.05` parametrizable.

| Relevancia | Peso | Criterio |
|---|---|---|
| Principal | 3 | Sin este control la amenaza no se contiene |
| Complementario | 2 | Reduce de forma sustantiva, no sustituye al principal |
| De apoyo | 1 | Ayuda por vía administrativa o cultural |

El techo es la parte esencial: **los controles secundarios acompañan al principal, no lo sustituyen.**
Solo actúa cuando el principal está débil; cuando está fuerte no muerde.

### 9.3 Consecuencias en el modelo de datos

```sql
alter table amenaza_control
  add column relevancia_id int not null references relevancia_control(id);

create table relevancia_control (
  id serial primary key,
  nombre text not null unique,        -- Principal | Complementario | De apoyo
  peso numeric(4,2) not null,         -- 3 | 2 | 1
  es_principal boolean not null default false,
  orden int not null
);
```

Reglas de integridad **obligatorias**:

1. Cada amenaza debe tener **exactamente un** control marcado como Principal. Validación a nivel de base
   de datos, no solo de interfaz.
2. Al desactivar un control marcado Principal, el sistema exige designar otro antes de guardar.
3. Un control marcado `No aplica` se excluye del promedio; si era el Principal, hay que reasignar.
4. `relevancia` y `peso` son parametrizables (§3). Cambiarlos recalcula todas las eficacias.
5. El par (amenaza, control) es único; hay **272 pares** en el catálogo inicial, 4,8 controles por
   amenaza en promedio y máximo 8.

### 9.4 Lo que debe verse en la interfaz

- En la ficha de la amenaza: la lista de controles con su relevancia, su madurez y la eficacia agregada
  resultante, **indicando si el techo está actuando**. Cuando actúa hay que decirlo de forma explícita:
  «la eficacia está limitada por A.8.12 DLP, que está en L2».
- En la ficha del control: cuántas amenazas mitiga, en cuántas es Principal, y cuántos riesgos mueve
  su nivel de madurez. Ese último número es el que prioriza el plan de tratamiento.
- Al simular una subida de madurez, mostrar el efecto sobre el riesgo residual antes de guardar.

### 9.5 Evolución posterior, no ahora

Lo rigurosamente correcto es agrupar los controles por **función** —preventiva, disuasoria, de detección,
correctiva, de recuperación, de concienciación, que MAGERIT ya distingue— y combinar distinto dentro y
entre grupos: dentro de una función los controles son parcialmente redundantes (media ponderada), entre
funciones actúan en serie sobre el flujo del incidente (composición con factor de correlación). Dejar el
modelo preparado con un campo `funcion_control` en `control`, pero no implementar la composición todavía.

---

## 10. Plan de tratamiento

> La unidad del plan es la **acción sobre un control**, nunca el riesgo. Con 2.256 riesgos un plan por
> riesgo es inmanejable, y además incorrecto: desde que la eficacia sale de la madurez de los controles,
> un riesgo individual no puede bajarse por separado.

### 10.1 Modelo

```sql
create table accion_tratamiento (
  id serial primary key,
  codigo text not null unique,                    -- PT-001
  titulo text not null,
  tipo text not null check (tipo in ('Mitigar','Transferir','Evitar','Aceptar')),
  control_id int references control(id),          -- obligatorio si tipo='Mitigar'
  origen text not null,                           -- por qué existe esta acción
  madurez_objetivo_id int references escala_madurez(id),
  responsable_cargo_id int not null references cargo(id),
  propietario_riesgo_cargo_id int not null references cargo(id),   -- quien APRUEBA
  fecha_aprobacion date,
  fecha_objetivo date,
  recursos text,
  estado text not null check (estado in ('No iniciada','En ejecución','En verificación','Cerrada','Cancelada')),
  avance numeric(5,2) default 0,
  evidencia_url text,
  fecha_cierre date,
  madurez_alcanzada_id int references escala_madurez(id),
  verificacion text check (verificacion in ('Pendiente','Verificada — eficaz','Verificada — no eficaz','No aplica')),
  -- solo para tipo='Transferir'
  instrumento text, riesgo_remanente text,
  -- solo para tipo='Aceptar'
  justificacion_aceptacion text, fecha_revision_aceptacion date,
  observacion text
);
```

### 10.2 Reglas

1. **Dos personas distintas**: `responsable_cargo_id` ejecuta, `propietario_riesgo_cargo_id` aprueba.
   ISO/IEC 27001 cláusula 6.1.3 exige la aprobación del propietario del riesgo.
2. **El antes y el después se calculan, no se capturan**: madurez actual, salto, riesgos que mueve y
   riesgo residual proyectado salen de consulta. Si son campos editables, mentirán en el siguiente corte.
3. `tipo='Aceptar'` exige `justificacion_aceptacion` y `fecha_revision_aceptacion` no nulos. Una
   aceptación sin fecha de caducidad se rechaza al guardar.
4. `tipo='Transferir'` exige `instrumento` y `riesgo_remanente` no nulos.
5. `estado='Cerrada'` exige `verificacion` distinto de 'Pendiente' y `madurez_alcanzada_id` no nulo.
6. **Las declaraciones de no aplicabilidad son acciones** de tipo Aceptar, con aprobación del Comité.
   Los 7 controles del dominio físico marcados No aplica deben tener su registro.
7. Alerta automática cuando `fecha_objetivo < hoy` y `estado <> 'Cerrada'`.

### 10.3 Vista de priorización

El orden del plan no lo decide una persona: sale de multiplicar el salto de madurez comprometido por el
número de riesgos residuales Medio o superior que el control toca. Esa consulta es la que debe abrir el
módulo.

## 11. Trampas conocidas

- **Códigos de amenaza con asterisco**: `N.*` e `I.*`. En SQL no molestan, pero en cualquier export a Excel
  el asterisco actúa como comodín y rompe `BUSCARV`/`COINCIDIR`/`CONTAR.SI`. Sanearlos al exportar
  (sustituir `*` por `-` en las claves de búsqueda) o usar `SUMAPRODUCTO(EXACTO(...))`.
- **No guardar números de escala en los registros operativos**: guardar la referencia al nivel.
  De lo contrario, cambiar la escala obliga a una migración de datos.
- **Granularidad del inventario**: dos elementos son el mismo activo si comparten propietario, valoración
  y controles. No inventariar instancias ni recursos efímeros: se registra el servicio que soportan.
  La UI de alta debe advertirlo.
- **Concurrencia en el consecutivo**: usar la tabla `contador_codigo` con `UPDATE ... RETURNING`, nunca `MAX()+1`.
- **El impacto residual no existe** en este modelo. Si aparece en algún reporte, es un error de implementación.
- **Nunca promediar la eficacia sin pesos ni techo** (§9). Es el error que más falsea el riesgo residual.
- **Nunca componer eficacias como probabilidades independientes**: cuatro controles en L3 darían 99,995 %.
- **Nunca hacer un plan de tratamiento por riesgo** (§10). La unidad es la acción sobre un control.
