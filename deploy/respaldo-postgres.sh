#!/usr/bin/env bash
#
# deploy/respaldo-postgres.sh
#
# Dumps the SGSI database and prunes old dumps.
#
# Until the SGSI module landed, this application had no state: a dead container was
# replaced and nothing was lost, because every figure was read from SharePoint on each
# start. That is no longer true. The container now holds the MAGERIT model, the 234
# assets, the 2256 risks, the treatment plan and the bitácora — and the bitácora is the
# one an auditor asks for, so losing it is not an inconvenience, it is a finding.
#
# Run from the directory that holds the compose file.
#
# Daily schedule, as the deploy user:
#   0 3 * * * cd /home/ubuntu/sgi-cuantico && bash deploy/respaldo-postgres.sh >> /var/log/sgi-respaldo.log 2>&1

set -euo pipefail

DESTINO="${SGI_RESPALDO_DIR:-/home/ubuntu/respaldos/sgi}"
RETENCION_DIAS="${SGI_RESPALDO_RETENCION:-30}"
# Named explicitly: the server still holds the previous, hand-maintained
# docker-compose.yml, and a bare `docker compose` would pick THAT one up and look for a
# database service it does not define. A backup that silently targets the wrong stack is
# how you find out, months later, that you have been dumping nothing.
ARCHIVO_COMPOSE="${SGI_COMPOSE_FILE:-docker-compose.prod.yml}"
SERVICIO="sgi-postgres"
BASE="sgi_sgsi"
USUARIO="sgi"

if [ ! -f "$ARCHIVO_COMPOSE" ]; then
  echo "ERROR: no encuentro $ARCHIVO_COMPOSE en $(pwd)" >&2
  exit 1
fi

mkdir -p "$DESTINO"

marca="$(date -u +%Y%m%dT%H%M%SZ)"
archivo="$DESTINO/${BASE}-${marca}.sql.gz"

echo "[$(date -u +%FT%TZ)] respaldando $BASE en $archivo"

# --clean --if-exists so the dump can be restored over an existing database without
# hand-editing it first. A backup you cannot restore under pressure is not a backup.
docker compose -f "$ARCHIVO_COMPOSE" exec -T "$SERVICIO" \
  pg_dump --username="$USUARIO" --dbname="$BASE" --clean --if-exists \
  | gzip -9 > "$archivo"

# A gzip that unpacks is the cheapest proof the dump is not truncated. Silence here is
# how you find out months later that every file was empty.
if ! gzip -t "$archivo"; then
  echo "ERROR: el respaldo salió corrupto, se elimina" >&2
  rm -f "$archivo"
  exit 1
fi

tamano="$(du -h "$archivo" | cut -f1)"
echo "[$(date -u +%FT%TZ)] listo, $tamano"

# Prune only after a verified new dump exists, never before: deleting first and failing
# second is how a retention policy becomes a data-loss policy.
borrados="$(find "$DESTINO" -name "${BASE}-*.sql.gz" -mtime "+${RETENCION_DIAS}" -print -delete | wc -l)"
if [ "$borrados" -gt 0 ]; then
  echo "[$(date -u +%FT%TZ)] se retiraron $borrados respaldos de más de $RETENCION_DIAS días"
fi

echo "[$(date -u +%FT%TZ)] respaldos vigentes: $(find "$DESTINO" -name "${BASE}-*.sql.gz" | wc -l)"
