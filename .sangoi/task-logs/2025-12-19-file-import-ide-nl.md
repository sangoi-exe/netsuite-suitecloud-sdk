# Task log — Implement `file:import` (java-free) via `/app/ide/ide.nl` ImportFiles

Data: 2025-12-19

## Objetivo
Implementar `file:import` no fork java-free sem depender do JAR, usando o servlet `ide.nl` (action `ImportFiles`) e extraindo o ZIP retornado para dentro do projeto (`FileCabinet/` + `.attributes/`).

## Wire format (via `~/.netsuite/sdf_source`)
- Endpoint: `POST /app/ide/ide.nl`
- Multipart fields:
  - `action=ImportFiles`
  - `files=<media>...</media>` (XML)
- O campo `files` inclui `<file>` entries com:
  - `<path>/SuiteScripts/foo.js</path>`
  - `<content>true</content>`
  - `<attributes>true|false</attributes>` (controlado por `--excludeproperties`)

Response:
- Body é um ZIP (content-type observado: `application/octect-stream;charset=utf-8`) contendo:
  - `status.xml` com `<result><path>...<loaded>true|false</loaded><message>...</message></result>`
  - arquivos retornados com paths relativos ao projeto (ex.: `FileCabinet/SuiteScripts/foo.js` e `.attributes/...`)

## Implementação
- `packages/node-cli/src/services/netsuite/NetSuiteFileCabinetImportService.js`:
  - monta XML `<media>` e multipart
  - chama `/app/ide/ide.nl` com Bearer token + cookie jar (retry 1x se body vazio + `set-cookie`)
  - extrai ZIP com `yauzl.fromBuffer` e grava entradas dentro do `projectFolder` (defesa contra path traversal)
  - parseia `status.xml` em `{ results: [{path, loaded, message}] }`
- `packages/node-cli/src/core/sdkexecutor/NodeSdkExecutor.js`:
  - implementa SDK command `importfiles`

## Escopos (importante)
- Validação real (sandbox): o endpoint `/app/ide/ide.nl` exige token OAuth2 com scope incluindo `restlets`.
- Fix: emitir token com `--scope "rest_webservices restlets"` (ou env `SUITECLOUD_SCOPES` / `NS_SCOPES`).

## Testes
- `packages/node-cli/__test__/services/NetSuiteFileCabinetImportService.test.js`
- `cd packages/node-cli && npm test`

## Validação (sandbox)
- Subi `FileCabinet/SuiteScripts/smoke-import.txt` via `file:upload` e importei de volta via `file:import --paths "/SuiteScripts/smoke-import.txt"`.
- Resultado: arquivos importados + `.attributes/...` conforme esperado.

