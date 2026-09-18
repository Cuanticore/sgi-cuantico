@echo off
setlocal
cd /d "%~dp0"
title Preparar la base local - sgi_sgsi

rem  UNA SOLA VEZ POR EQUIPO. Crea el rol y la base que nombra DATABASE_URL en .env, corre
rem  las migraciones y siembra. Despues de esto, iniciar.bat no vuelve a pedir nada.
rem
rem  Sin acentos a proposito: la consola de Windows usa cp850 y los mostraria rotos.
rem
rem  NO NECESITA DOCKER. Usa el PostgreSQL 17 instalado en este equipo (servicio
rem  postgresql-x64-17, puerto 5432). docker-compose.dev.yml sigue siendo una alternativa
rem  valida para quien prefiera el contenedor, pero no hace falta.

if not exist ".env" (
  echo.
  echo  Falta .env. Copiar .env.example y completar las claves.
  echo.
  pause
  exit /b 1
)

echo.
echo  ============================================================
echo   Preparar la base local del SIG
echo  ============================================================
echo.

rem  El servicio tiene que estar arriba antes de intentar nada: "conexion rechazada" es un
rem  mensaje que manda a revisar credenciales cuando el problema era que Postgres no corria.
sc query postgresql-x64-17 | find "RUNNING" >nul
if errorlevel 1 (
  echo  El servicio postgresql-x64-17 no esta corriendo. Intentando iniciarlo...
  net start postgresql-x64-17
  if errorlevel 1 (
    echo.
    echo  No se pudo iniciar PostgreSQL. Revisar el servicio postgresql-x64-17.
    echo.
    pause
    exit /b 1
  )
)

echo  [1/4] Creando el rol y la base...
call npx tsx scripts/preparar-bd-local.ts
if errorlevel 1 goto :fallo

echo.
echo  [2/4] Generando el cliente de Prisma...
call npx prisma generate
if errorlevel 1 goto :fallo

echo.
echo  [3/4] Aplicando las migraciones...
call npx prisma migrate deploy
if errorlevel 1 goto :fallo

echo.
echo  [4/4] Sembrando el SGSI y los datos de prueba...
call npx prisma db seed
if errorlevel 1 goto :fallo
call npx tsx prisma/seeds/demo.ts
if errorlevel 1 goto :fallo

echo.
echo  ============================================================
echo   Listo. Ahora: iniciar.bat
echo  ============================================================
echo.
pause
exit /b 0

:fallo
echo.
echo  ============================================================
echo   FALLO. La base quedo a medias: revisar el error de arriba.
echo  ============================================================
echo.
pause
exit /b 1
