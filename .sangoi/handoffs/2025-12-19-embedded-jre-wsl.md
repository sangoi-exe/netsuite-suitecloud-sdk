# Handoff — Embedded JRE para SuiteCloud CLI (Linux/WSL)

Data: 2025-12-19

Status: **obsoleto** (fork agora é java-free; JAR/JRE removidos)

## Objetivo
Rodar `suitecloud` no WSL/Linux sem exigir Java instalado no sistema, e permitir que o “cache” do SDK more dentro de `~/.netsuite` (ou outro path) via env var.

## O que mudou
- `packages/node-cli/src/services/SdkHomeService.js`: centraliza o “home” do SDK (default `~/.suitecloud-sdk`, override via `SUITECLOUD_SDK_HOME`).
- A abordagem de “JRE embutido” foi revertida em favor de um SDK 100% Node sem Java.

## Como usar
Exemplo (WSL/Linux):
```bash
export SUITECLOUD_SDK_HOME="$HOME/.netsuite/suitecloud-sdk"
```

## Como validar
Rodado localmente (2025-12-19):
- `npm ci`
- `npm test` em `packages/node-cli`

## Limitações / riscos
- N/A (feature removida).

## Próximos passos
- Ver `.sangoi/planning/obliterate-java.md` para o plano java-free.
