@echo off
setlocal
cd /d "%~dp0"
title Indicadores SIG - local en 3000

rem  Arranque local de la aplicacion. NO NECESITA DOCKER: la base es el PostgreSQL 17
rem  instalado en este equipo, y el aislamiento de origen que el player SCORM exige se
rem  resuelve con dos nombres del mismo servidor.
rem
rem  La primera vez en un equipo: preparar-bd.bat  (crea el rol, la base y las semillas).
rem
rem  Sin acentos a proposito: la consola de Windows usa cp850 y los mostraria rotos.
rem
rem  ── POR QUE 3000 Y NO 3004 ───────────────────────────────────────────────────────────
rem  El callback de Azure AD registrado para local apunta a
rem  http://localhost:3000/api/auth/callback/azure-ad. El puerto no es cosmetico: si no
rem  coincide con el registrado, Azure rechaza el inicio de sesion y la aplicacion no pasa
rem  de la pantalla de login. Produccion sigue en 3004 y no se toca.
rem
rem  ── LOS DOS ORIGENES DEL PLAYER ──────────────────────────────────────────────────────
rem  El player exige servir el contenido del curso desde un ORIGEN DISTINTO al de la
rem  aplicacion (P3 del requerimiento). En produccion eso es un subdominio con DNS y
rem  certificado; aca alcanza con que el navegador vea dos origenes:
rem
rem    http://localhost:3000   la aplicacion   (tiene la cookie de sesion)
rem    http://127.0.0.1:3000   el contenido    (NO la tiene: la cookie es host-only)
rem
rem  Es el MISMO servidor de Next respondiendo, y el aislamiento es real, no simulado.

set "PUERTO=3000"

if not exist ".env" (
  echo.
  echo  Falta .env. Copiar .env.example y completar las claves.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo.
  echo  Falta node_modules. Instalando dependencias...
  call npm install
  if errorlevel 1 (
    echo.
    echo  Fallo npm install.
    echo.
    pause
    exit /b 1
  )
)

rem  Un servidor viejo en el mismo puerto no falla al arrancar: Next toma el siguiente libre
rem  y se queda en 3001, donde el callback de Azure ya no coincide. El sintoma seria un login
rem  que rebota sin decir por que, asi que se frena aca.
netstat -ano -p TCP | findstr /C:"LISTENING" | findstr /C:":%PUERTO% " >nul
if not errorlevel 1 (
  echo.
  echo  El puerto %PUERTO% ya esta ocupado. Cerrar el otro servidor antes de seguir:
  echo    netstat -ano ^| findstr :%PUERTO%
  echo.
  pause
  exit /b 1
)

sc query postgresql-x64-17 | find "RUNNING" >nul
if errorlevel 1 (
  echo  PostgreSQL no esta corriendo. Iniciando el servicio...
  net start postgresql-x64-17
  if errorlevel 1 (
    echo.
    echo  No se pudo iniciar PostgreSQL. Revisar el servicio postgresql-x64-17.
    echo.
    pause
    exit /b 1
  )
)

rem  Comprobar la base ANTES de compilar. Sin esto, una base sin preparar se manifiesta como
rem  una pantalla de error de Next dos minutos despues, culpando a la pantalla que se abrio.
call npx tsx scripts/preparar-bd-local.ts --comprobar
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)

rem  El cliente de Prisma se regenera segun el esquema: sin esto, un `git pull` con una
rem  migracion nueva da errores de tipo que parecen de codigo.
call npx prisma generate >nul 2>&1

echo.
echo  ============================================================
echo   Indicadores SIG - desarrollo
echo  ============================================================
echo.
echo   Aplicacion      http://localhost:%PUERTO%
echo   Mis cursos      http://localhost:%PUERTO%/mi-sig
echo   Contenidos      http://localhost:%PUERTO%/sig/contenidos    (subir el .zip SCORM)
echo   Diagnostico     http://localhost:%PUERTO%/mi-sig/diagnostico (que trae tu token)
echo.
echo   Origen de contenido del player:  http://127.0.0.1:%PUERTO%
echo   Ahi responden /scorm/runner y /scorm/archivo/*, y nada mas.
echo   En http://localhost:%PUERTO% esas rutas dan 404 a proposito.
echo.
echo   Ctrl+C para bajar el servidor.
echo  ============================================================
echo.

rem  Se llama a `npm run dev` y no a `npx next dev -p 3000` a proposito: que el puerto viva en
rem  un solo lugar es lo que impide que este bat y el script de npm se separen. El dia que se
rem  separen, uno levanta el servidor en un puerto y el callback de Azure apunta al otro.
call npm run dev
