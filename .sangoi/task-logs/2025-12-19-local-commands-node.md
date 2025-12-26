# Task log — Portar comandos locais (Node-only)

Data: 2025-12-19

## Pedido
Melhorar o “lixo” como um todo e continuar a migração java-free, começando pelos comandos que não dependem de rede.

## Entregas
- `project:create` agora funciona sem Java/JAR:
  - Implementado o SDK command `createproject` no engine Node.
  - Gera `manifest.xml` + `deploy.xml` e, para SuiteApp, `InstallationPreferences/*`.
- `file:create` agora funciona sem Java/JAR:
  - Implementado o SDK command `createfile` no engine Node.
  - Gera skeleton SuiteScript 2.1 com `define([...])` e injeta módulos.
  - Proteção contra path traversal: escrita garantida dentro de `FileCabinet/`.
- Fixes de path:
  - `FOLDERS.*` deixaram de ser absolutos (evita `path.join` “resetar” pro root).
  - `ProjectInfoService` agora parseia `manifest.xml` com `explicitArray=false`, retornando strings em vez de arrays.

- Preview local de deploy:
  - Implementado o SDK command `preview` para suportar `project:deploy --dryrun` (lista as entradas incluídas via `deploy.xml`).

## Arquivos principais
- `packages/node-cli/src/core/sdkexecutor/NodeSdkExecutor.js`
- `packages/node-cli/src/services/ProjectCreationService.js`
- `packages/node-cli/src/services/SuiteScriptFileService.js`
- `packages/node-cli/src/services/ProjectPreviewService.js`
- `packages/node-cli/src/commands/file/create/CreateFileAction.js`
- `packages/node-cli/src/commands/file/create/CreateFileInputHandler.js`
- `packages/node-cli/src/services/ProjectInfoService.js`
- `packages/node-cli/src/ApplicationConstants.js`

## Testes
- `packages/node-cli/__test__/services/ProjectCreationService.test.js`
- `packages/node-cli/__test__/services/SuiteScriptFileService.test.js`
- `cd packages/node-cli && npm test`
