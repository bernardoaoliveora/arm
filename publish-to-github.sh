#!/usr/bin/env bash
# ==============================================================================
# Script de Publicação Automática no GitHub
# Repositório Remoto: https://github.com/bernardoaoliveora/arm.git
# ==============================================================================

set -e

echo "=============================================================================="
echo " PUBLICANDO REPOSITÓRIO NO GITHUB: https://github.com/bernardoaoliveora/arm.git"
echo "=============================================================================="
echo ""

echo "1. Definindo branch principal como 'main'..."
git branch -M main

echo "2. Verificando configuração do repositório remoto (origin)..."
if ! git remote get-url origin > /dev/null 2>&1; then
    echo "Configurando remote origin..."
    git remote add origin https://github.com/bernardoaoliveora/arm.git
else
    echo "Remote origin já configurado: $(git remote get-url origin)"
fi

echo ""
echo "3. Enviando commits para origin/main..."
echo "(Se solicitado, autentique-se via GitHub CLI ou informe seu Personal Access Token)"
echo ""

git push -u origin main

echo ""
echo "=============================================================================="
echo " SUCESSO: Projeto publicado no GitHub com êxito!"
echo " Acesse: https://github.com/bernardoaoliveora/arm"
echo "=============================================================================="
