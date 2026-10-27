@echo off
chcp 65001 > nul
echo ==============================================================================
echo  PUBLICACAO DO REPOSITORIO NO GITHUB: bnwebstudio / arm
echo ==============================================================================
echo.

echo 1. Verificando integridade e branch...
git branch -M main

echo 2. Verificando configuracao do remote origin...
git remote -v

echo.
echo 3. Enviando commits para https://github.com/bernardoaoliveora/arm.git...
echo (Se for solicitado login, utilize suas credenciais do GitHub ou Personal Access Token)
echo.
git push -u origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ==============================================================================
    echo  SUCESSO: Projeto publicado no GitHub com exito!
    echo  Acesse em: https://github.com/bernardoaoliveora/arm
    echo ==============================================================================
) else (
    echo.
    echo ==============================================================================
    echo  AVISO: Falha no envio para o GitHub.
    echo  Verifique se o repositorio remoto esta vazio ou se precisa autenticar via:
    echo    1. gh auth login (GitHub CLI) OU
    echo    2. Personal Access Token (PAT) com escopo 'repo'
    echo    3. Caso o repositorio remoto ja possua commits, use: git push -u origin main --force
    echo ==============================================================================
)

pause
