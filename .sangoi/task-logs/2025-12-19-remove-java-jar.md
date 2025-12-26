# Task log — Remover Java/JAR do fork

Data: 2025-12-19

## Pedido
“Como se eu fosse deixar Java/JAR no meu fork” — remover completamente qualquer caminho de execução/download do SDK Oracle (JAR) e a dependência de `java`.

## Mudanças
- Removidos executors/paths do JAR e engine selection associada:
  - deletado: `packages/node-cli/src/core/sdkexecutor/OracleJarSdkExecutor.js`
  - deletado: `packages/node-cli/src/core/sdkexecutor/AutoSdkExecutor.js`
  - deletado: `packages/node-cli/src/core/sdkexecutor/SdkExecutorFactory.js`
  - `packages/node-cli/src/SdkExecutor.js` agora usa **apenas** `NodeSdkExecutor`.
- Removidos download/licença/postinstall do SDK Oracle:
  - deletado: `packages/node-cli/src/core/sdksetup/*`
  - removido script `postinstall` do `packages/node-cli/package.json`
- Removidos helpers Java/JRE:
  - deletado: `packages/node-cli/src/services/EmbeddedJreService.js`
  - deletado: `packages/node-cli/src/services/JavaExecutableService.js`
  - deletado: `packages/node-cli/src/services/EnvironmentInformationService.js`
  - deletado: `packages/node-cli/src/services/settings/*` (settings Java/VM options)
- Docs atualizadas para refletir “java-free” (sem `SUITECLOUD_SDK_ENGINE` / sem vars de Java/JAR).

## Impacto
- `project:package` continua funcionando via Node.
- Demais comandos que dependiam do JAR agora precisam ser implementados no engine Node (ou irão falhar com erro “not implemented”).

## Validação
- `cd packages/node-cli && npm test`

