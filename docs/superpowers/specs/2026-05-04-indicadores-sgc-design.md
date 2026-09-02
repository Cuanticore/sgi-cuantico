# Dashboard de Indicadores SGC ISO 9001 — Diseño

**Fecha:** 2026-05-04  
**Estado:** Aprobado por Daniel Medina  
**Stack:** Next.js 14 · NextAuth · Microsoft Graph · ECharts · Tremor · Tailwind CSS

---

## 1. Objetivo

Single-page web app interna para Cuantico que muestra el Cuadro de Mando de Indicadores ISO 9001 2026. Accesible a todo el equipo Cuantico mediante autenticación Azure AD. Los datos se leen en tiempo real desde los archivos Excel en SharePoint vía Microsoft Graph API.

---

## 2. Usuarios y Acceso

- **Audiencia:** Todo el equipo Cuantico (organización Azure AD: tenant `4ade459a-df74-47ac-8846-7fbd0e6aad1b`)
- **Auth:** Azure AD OAuth2 via NextAuth.js — cualquier usuario del tenant puede iniciar sesión
- **Roles:** Sin roles diferenciados en v1 — vista única para todos
- **Sesión:** JWT client-side, expira en 24 h

---

## 3. Fuente de Datos

### Archivos Excel en SharePoint
| Archivo | Ruta Graph API (relativa al drive root) | Contenido |
|---------|----------------------------------------|-----------|
| `1. Indicadores de Gestión 2026.xlsx` | `0. Compañia/11. Sistema Gestión de Calidad/9. Evaluación de Desempeño/4. Indicadores/2. 2026/1. Indicadores de Gestión 2026.xlsx` | Fuente principal — hoja "Cuadro de Mando 2026" + "Indicadores Gestión" |
| `2. Indicadores Operativos 2026.xlsx` | Mismo directorio | Indicadores operativos (v2) |

**Site:** `cuanticore.sharepoint.com/sites/Cuantico` · **Librería:** `Shared Documents` (confirmado en URL)

### Hojas clave del archivo principal
- **`Cuadro de Mando 2026`** — resumen ejecutivo, cumplimiento por trimestre/proceso, evolución mensual
- **`Indicadores Gestión`** — listado completo de 26 indicadores con resultados mensuales

### Acceso via Microsoft Graph
- Credenciales: `SHAREPOINT_CLIENT_ID` / `SHAREPOINT_CLIENT_SECRET` / `SHAREPOINT_TENANT_ID`
- Endpoint: `GET https://graph.microsoft.com/v1.0/sites/{site-id}/drives/{drive-id}/root:/{path}:/workbook/worksheets/{sheet}/usedRange`
- Token: client_credentials flow (app-only, no requiere delegación del usuario)
- Caché: datos en memoria con TTL de 5 minutos en el servidor (revalidación Next.js)

---

## 4. Arquitectura

```
Browser (Next.js SSR/CSR)
    │
    ├── /                     → Dashboard (protegida, requiere sesión)
    ├── /api/auth/[...nextauth] → Azure AD OAuth2 callback
    └── /api/indicators        → Lee SharePoint, retorna JSON cacheado
                                     │
                              Microsoft Graph API
                                     │
                              SharePoint (cuanticore.sharepoint.com/sites/Cuantico)
                                     │
                              Excel files (.xlsx) — solo lectura
```

### Módulos Next.js
```
app/
├── layout.tsx                 — Root layout, SessionProvider
├── page.tsx                   — Dashboard (server component, redirige si no hay sesión)
├── api/
│   ├── auth/[...nextauth]/route.ts   — NextAuth Azure AD
│   └── indicators/route.ts           — GET /api/indicators → JSON
└── components/
    ├── HeroBanner.tsx         — Banner oscuro animado con canvas partículas + contadores
    ├── KPICard.tsx            — Card flotante con valor, progreso y color por estado
    ├── ProcessBarChart.tsx    — ECharts barras horizontales por proceso
    ├── MonthlyTrendChart.tsx  — ECharts línea mensual con área degradada + meta
    ├── ProcessGaugeGrid.tsx   — Grid 3×3 de gauges ECharts, uno por proceso
    ├── QualityRadar.tsx       — ECharts radar OC1–OC5 resultado vs meta
    ├── QuarterSummary.tsx     — Cards Q1/Q2/Q3/Q4 con estado
    └── IndicatorsTable.tsx    — Tabla filtrable por estado/proceso/frecuencia
```

---

## 5. Diseño Visual

### Layout (opción B aprobada)
- **Navbar fija:** logo Cuantico + selector de año + avatar usuario Azure AD
- **Hero banner:** gradiente oscuro `#0f172a → #1B3A8A`, partículas canvas animadas, contadores numéricos con animación count-up
- **KPI cards flotantes:** 4 cards sobre el hero (Avance Global, En Meta, Alerta, Crítico) con borde superior de color
- **Sección análisis:** grid 60/40 — barras por proceso + línea mensual
- **Grid de procesos:** 3×3 gauge circular ECharts por proceso
- **Radar objetivos:** OC1–OC5 vs meta
- **Tabla completa:** con filtros por estado y proceso, expandible

### Paleta de colores
| Token | Valor | Uso |
|-------|-------|-----|
| `primary` | `#1B3A8A` | Hero, nav, acentos principales |
| `accent` | `#0EA5E9` | Charts, progress bars, links |
| `success` | `#22c55e` | En meta (≥ meta) |
| `warning` | `#f59e0b` | Alerta (nivel medio) |
| `danger` | `#ef4444` | Crítico (nivel crítico) |
| `neutral` | `#94a3b8` | Sin datos |
| `bg` | `#f1f5f9` | Fondo de página |
| `surface` | `#ffffff` | Cards |

> Ajustar `primary` a los colores exactos de cuantico.com una vez accesible.

### Animaciones ECharts (aprobadas)
1. **Gauge circular** — barrido animado con gradiente `#1B3A8A → #0EA5E9`, duración 2 s
2. **Barras horizontales** — crecimiento desde izquierda, color por estado, 1.2 s
3. **Línea mensual** — dibujado progresivo con relleno degradado + línea de meta punteada, 1.8 s
4. **Radar OC1–OC5** — expansión desde el centro, 1.5 s
5. **Partículas canvas** — loop continuo en el hero banner
6. **Count-up** — contadores numéricos animados al cargar (0 → valor real)

---

## 6. Lógica de Negocio

### Estados de indicadores
```
resultado >= meta          → 🟢 En meta   (success #22c55e)
meta > resultado >= medio  → 🟡 Alerta    (warning #f59e0b)
resultado < medio          → 🔴 Crítico   (danger  #ef4444)
sin medición               → ⚪ Sin datos  (neutral #94a3b8)
```

### Cálculo de avance global
- Promedio de todos los resultados medidos (excluyendo "Sin datos")
- Fuente: celda `[7]` fila 7 de hoja "Cuadro de Mando 2026" (valor: 81.4%)

### Datos parseados del Excel
El API `/api/indicators` retorna:
```typescript
{
  summary: {
    avanceGlobal: number,       // 81.4
    totalIndicadores: number,   // 26
    medidos: number,            // 17
    enMeta: number,             // 11
    alerta: number,             // 1
    critico: number             // 2
  },
  trimestres: Quarter[],        // Q1–Q4 con cumplimiento y estado
  procesos: Process[],          // 9 procesos con cumplimiento y # indicadores
  mensual: MonthlyData[],       // Ene–Dic con % cumplimiento
  indicadores: Indicator[],     // 26 indicadores con todos los campos
  objetivosCalidad: QC[]        // OC1–OC5 con nombre y cumplimiento
}
```

---

## 7. Autenticación Azure AD

### Configuración NextAuth
```typescript
// app/api/auth/[...nextauth]/route.ts
AzureADProvider({
  clientId: process.env.SHAREPOINT_CLIENT_ID,
  clientSecret: process.env.SHAREPOINT_CLIENT_SECRET,
  tenantId: process.env.SHAREPOINT_TENANT_ID,
})
```

### Variables de entorno requeridas
```bash
# Azure AD / NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<generar con: openssl rand -base64 32>
AZURE_AD_CLIENT_ID=4b24bb04-19b7-4d55-bb9f-260fae17dac3   # = SHAREPOINT_CLIENT_ID
AZURE_AD_CLIENT_SECRET=REPLACE_WITH_AZURE_AD_CLIENT_SECRET
AZURE_AD_TENANT_ID=4ade459a-df74-47ac-8846-7fbd0e6aad1b

# SharePoint Graph
SHAREPOINT_TENANT_ID=4ade459a-df74-47ac-8846-7fbd0e6aad1b
SHAREPOINT_CLIENT_ID=4b24bb04-19b7-4d55-bb9f-260fae17dac3
SHAREPOINT_CLIENT_SECRET=REPLACE_WITH_AZURE_AD_CLIENT_SECRET
SHAREPOINT_SITE_URL=cuanticore.sharepoint.com
SHAREPOINT_SITE_NAME=Cuantico
# Ruta verificada desde SharePoint (cuanticore.sharepoint.com/sites/Cuantico/Shared Documents/)
# La librería se llama "Shared Documents" (confirmado en URL del sitio).
# En Graph API el path es relativo al drive root (sin prefijo de librería):
SHAREPOINT_INDICATORS_PATH=0. Compañia/11. Sistema Gestión de Calidad/9. Evaluación de Desempeño/4. Indicadores/2. 2026
SHAREPOINT_INDICATORS_FILE=1. Indicadores de Gestión 2026.xlsx
```

### Requisito previo en Azure Portal
El app registration `4b24bb04-...` necesita:
- **Redirect URI agregada:** `http://localhost:3000/api/auth/callback/azure-ad`
- **Permisos API:** `User.Read` (delegado) — ya debería existir si se usa para SharePoint
- El flujo OAuth2 (Authorization Code) debe estar habilitado

---

## 8. Dependencias

```json
{
  "next": "14.x",
  "next-auth": "^4.24",
  "@azure/msal-node": "^2.x",
  "echarts": "^5.4",
  "echarts-for-react": "^3.0",
  "@tremor/react": "^3.x",
  "tailwindcss": "^3.x",
  "exceljs": "^4.x",
  "axios": "^1.x"
}
```

---

## 9. Flujo de Datos al Cargar

1. Usuario visita `/` → middleware verifica sesión NextAuth
2. Sin sesión → redirige a Azure AD login (`/api/auth/signin`)
3. Login exitoso → callback en `/api/auth/callback/azure-ad` → sesión JWT
4. `page.tsx` monta → llama `GET /api/indicators`
5. API route verifica caché (5 min) → si stale, llama Microsoft Graph
6. Graph API autenticada con client_credentials (SHAREPOINT_CLIENT_ID/SECRET)
7. Descarga rango de celdas de ambas hojas Excel
8. Parser extrae y normaliza los datos al schema TypeScript
9. Retorna JSON → componentes React renderizan con ECharts

---

## 10. Fuera de Alcance (v1)

- Edición de datos desde el dashboard (solo lectura)
- Roles diferenciados (admin vs viewer)
- Notificaciones o alertas por email
- Exportación a PDF
- Histórico de versiones / comparación de años anteriores
- Despliegue en producción (solo localhost:3000 en v1)
