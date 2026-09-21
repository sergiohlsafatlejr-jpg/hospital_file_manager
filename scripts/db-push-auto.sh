#!/bin/bash
set -e

echo "🔄 Iniciando migração do banco de dados..."
echo "Executando: pnpm db:push"

cd /home/ubuntu/hospital_file_manager

# Executar db:push com stdin vazio para evitar prompts. Com `set -e` e
# `pipefail`, qualquer falha do Drizzle interrompe o deploy e não é mascarada.
set -o pipefail
echo "" | pnpm db:push 2>&1

echo "✅ Migração concluída!"
