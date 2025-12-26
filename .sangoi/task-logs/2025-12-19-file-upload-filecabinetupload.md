# Task log — `file:upload` java‑free via `filecabinetupload.nl`

Data: 2025-12-19

## Objetivo
Fazer `file:upload` funcionar sem JAR, enviando arquivos do `FileCabinet/` local para o File Cabinet da conta.

## Implementação
- `packages/node-cli/src/services/netsuite/NetSuiteFileCabinetUploadService.js`
  - POST multipart para `/app/suiteapp/devframework/fileupload/filecabinetupload.nl`
  - Header `Authorization: Bearer <token>`
  - Query param `parentFolder=<fileCabinetPath do diretório pai>`
  - Multipart field `file` (conteúdo do arquivo)
- `packages/node-cli/src/core/sdkexecutor/NodeSdkExecutor.js`
  - adiciona comando SDK `uploadfiles`
  - converte `-paths` (string com aspas) em lista de paths do File Cabinet e envia um por um
  - retorna lista de resultados compatível com o `UploadFilesOutputHandler` (SUCCESS/ERROR por arquivo)

## Validação
- `cd packages/node-cli && npm test`

## Notas / limites atuais
- Upload é feito arquivo-a-arquivo (sem batch).
- Ainda falta implementar `file:import` (download do File Cabinet para o projeto).

