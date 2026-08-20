#!/usr/bin/env bash
# Deploy manual do DARA dashboard para o servidor Ubuntu/nginx.
#
# Uso:
#   ./deploy/deploy.sh usuario@servidor /var/www/daradados
#
# Publica só a pasta site/ (HTML+JS+dados), nunca pipeline/, docs/, schemas/.

set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Uso: $0 usuario@servidor /caminho/no/servidor"
  exit 1
fi

DEST_HOST="$1"
DEST_PATH="$2"
LOCAL_SITE="$(dirname "$0")/../site"

echo "Publicando $LOCAL_SITE em $DEST_HOST:$DEST_PATH ..."

rsync -avz --delete \
  --exclude ".DS_Store" \
  "$LOCAL_SITE"/ "$DEST_HOST:$DEST_PATH"/

echo "OK. Testar em https://daradados.com.br/dashboard.html"
