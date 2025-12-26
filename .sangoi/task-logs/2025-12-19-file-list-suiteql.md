# Task log — `file:list` java‑free via SuiteQL (REST)

Data: 2025-12-19

## Objetivo
Fazer `file:list` funcionar sem JAR, incluindo o modo interativo que precisa listar pastas do File Cabinet.

## Implementação
- `packages/node-cli/src/services/netsuite/SuiteQlService.js`: wrapper para REST Query Service (`/services/rest/query/v1/suiteql`) com paginação básica (`limit`/`offset`).
- `packages/node-cli/src/services/netsuite/NetSuiteFileCabinetService.js`: constrói índice de folders via SuiteQL e lista:
  - folders (`listfolders`)
  - arquivos de uma pasta (`listfiles`)
- `packages/node-cli/src/core/sdkexecutor/NodeSdkExecutor.js`:
  - adiciona comandos SDK `listfolders` e `listfiles`
  - resolve token/REST domain via auth store (com refresh automático via client_credentials quando expirado)

## Validação
- `cd packages/node-cli && npm test`

## Notas / limites atuais
- A implementação usa SuiteQL com queries simples (`FROM folder`, `FROM file`). Se o schema variar em contas específicas, a correção é ajustar as colunas consultadas.
- Ainda não cobre `file:upload`/`file:import` (próximo passo).

