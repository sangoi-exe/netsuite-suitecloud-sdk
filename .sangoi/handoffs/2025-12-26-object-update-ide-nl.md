# Handoff — `object:update` + `includeinstances` (java-free)

## Objetivo
Entregar `object:update` sem Java/JAR, incluindo suporte a `-includeinstances` para custom records, e deixar o engine Node consistente (executor + serviços + testes + docs).

## O que mudou
- `packages/node-cli/src/services/netsuite/NetSuiteCustomObjectsService.js`
  - `listObjects`/`importObjects`: retry 1x em body vazio com `set-cookie`, erro claro se persistir.
  - Suporte a `package_root` no multipart.
  - Novo `updateObjects`: `POST /app/ide/ide.nl` (`action=FetchCustomObjectXml`, `mode=UPDATE`) + extração segura no projeto.
  - Novo `updateCustomRecordWithInstances`: `POST /app/ide/fetchcustomrecordwithinstancesxml.nl` (form urlencoded `scriptid` + `appid` opcional) + extração segura.
  - Update preserva subpastas existentes sob `Objects/` quando o ZIP vem com filenames (mapeia `scriptId -> path` via scan).
- `packages/node-cli/src/core/sdkexecutor/NodeSdkExecutor.js`
  - Implementa `listobjects`/`importobjects` (antes só estavam roteados).
  - Implementa `update` e `updatecustomrecordwithinstances`.
  - Valida `destinationfolder` dentro de `Objects/` no `importobjects`.
- `packages/node-cli/__test__/services/NetSuiteObjectCommands.test.js`
  - Adiciona testes para `update` e `updatecustomrecordwithinstances`.
- Docs:
  - `packages/node-cli/README.md`
  - `.sangoi/research/sdf-protocol.md`
  - `.sangoi/CHANGELOG.md`
  - `.sangoi/task-logs/2025-12-26-object-update-ide-nl.md`

## Como usar
Exemplos (dentro de um projeto):
```bash
suitecloud object:list
suitecloud object:import -type customrecordtype -scriptid customrecord_test -destinationfolder /Objects
suitecloud object:update -scriptid customrecord_test
suitecloud object:update -scriptid customrecord_test -includeinstances
```

## Como validar
- Unit tests (já rodados aqui):
```bash
cd packages/node-cli
npm test
```
- Validação real em sandbox (pendente): rodar `object:update` com um authId válido. Se der HTML de login, reemitir token com `--scope "rest_webservices restlets"`.

## Riscos / limitações conhecidas
- `package_root` é inferido (ACP: `/SuiteScripts`, SuiteApp: `/SuiteApps/<appId>` via `manifest.xml`). Se o tenant exigir outra convenção, ajustar.
- `object:import` ainda não baixa SuiteScripts referenciados (o ZIP é extraído, mas o fork não implementa a etapa de “referenced files”).

## Próximos passos sugeridos
1. Testar em sandbox com `SUITECLOUD_HTTP_TRACE=1` habilitado para capturar wire-format sanitizado caso algo diverja.
2. Se necessário, ajustar semântica/valor de `package_root` com base no comportamento real do endpoint.

