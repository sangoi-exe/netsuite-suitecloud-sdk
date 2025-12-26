# Handoff — `object:list` + `object:import` java-free via `ide.nl`

Data: 2025-12-20

## Objetivo
Entregar `object:list` e `object:import` sem Java/JAR, mantendo a UX do CLI e contratos de output.

## O que mudou
- Implementado client `ide.nl` para custom objects:
  - `packages/node-cli/src/services/netsuite/NetSuiteCustomObjectsService.js`
  - Import de objetos parseia `status.xml` como lista de `<result>` (`key`/`type`/`message`) e extrai `.xml` para `destinationfolder`.
- Node engine (`NodeSdkExecutor`) agora suporta:
  - `listobjects` (`object:list`)
  - `importobjects` (`object:import`) com validação do `destinationfolder` sob `Objects/` e suporte a `-type ALL` (resolve tipo via listagem).
  - `packages/node-cli/src/core/sdkexecutor/NodeSdkExecutor.js`
- Testes cobrindo wire-format e unzip seguro:
  - `packages/node-cli/__test__/services/NetSuiteCustomObjectsService.test.js`
  - `packages/node-cli/__test__/services/NetSuiteObjectCommands.test.js`
- Docs/spec atualizadas:
  - `.sangoi/research/sdf-protocol.md`
  - `packages/node-cli/README.md`
  - `.sangoi/CHANGELOG.md`

## Como usar
Pré-requisitos:
- Auth ID configurado via `account:setup:ci` (com `SUITECLOUD_CI_PASSKEY`).
- Para `ide.nl`, incluir scope `restlets` (ex.: `--scope "rest_webservices restlets"`).

Exemplos:
```bash
suitecloud object:list
suitecloud object:import --type ALL --scriptid "customrecord_myrec" --destinationfolder "/Objects"
```

## Como validar
Unit tests:
```bash
cd packages/node-cli
npm test
```

## Riscos / limitações
- Schema XML/ZIP do `ide.nl` foi inferido via strings/constant pool; pode variar por versão/tenant.
- Import de SuiteScripts referenciados em ACP é best-effort (heurístico) e pode precisar ajuste após validação real.
- Ainda falta `object:update` (incl. `includeinstances`).

## Próximos passos sugeridos
1. Rodar em sandbox real (ACP e SuiteApp) e capturar trace sanitizado (`SUITECLOUD_HTTP_TRACE=1`) se houver divergência.
2. Fechar spec do `status.xml` (codes) e ajustar sucesso/erro (hoje usa heurística baseada em `code/message`).
3. Implementar `object:update` e `includeinstances`.
