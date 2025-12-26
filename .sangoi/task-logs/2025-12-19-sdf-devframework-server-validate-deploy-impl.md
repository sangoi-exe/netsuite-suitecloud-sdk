# Task log — Implement server validate/deploy via SDF Dev Framework handlers (java-free)

Data: 2025-12-19

## Objetivo
Avançar o bloqueio de `project:deploy` e `project:validate --server` (handlers `ide*handler.nl` respondendo `200` com body vazio) implementando:
- client Node para os handlers do SuiteApp Dev Framework (multipart + headers corretos)
- cookie jar + retry quando o server retorna body vazio com `set-cookie`
- trace HTTP sanitizado para depuração sem vazar segredos

## Mudanças feitas
- `packages/node-cli/src/services/netsuite/NetSuiteSdfDevFrameworkService.js`:
  - Implementa calls para:
    - `POST /app/suiteapp/devframework/idepreviewhandler.nl` (preview)
    - `POST /app/suiteapp/devframework/idevalidationhandler.nl` (validate server)
    - `POST /app/suiteapp/devframework/ideinstallhandler.nl` (deploy)
  - Sempre envia multipart com:
    - `mediafile` (zip) com `Content-Type: application/x-zip-compressed`
    - `accountspecificvalues` (default `ERROR`)
    - `applyinstallprefs` como `T|F`
  - Faz 1 retry automático quando recebe body vazio e vem `set-cookie` (compat com proteções/anti-bot).
  - Deploy faz 2-step automático quando response contém linha `token=...` (reenvia com `?token=<deployToken>`).

- `packages/node-cli/src/services/http/HttpClient.js`:
  - Suporte opcional a `cookieJar` por request (captura `set-cookie` e reenvia `cookie`).
  - Trace HTTP sanitizado via env:
    - `SUITECLOUD_HTTP_TRACE=1` (JSONL em stderr)
    - `SUITECLOUD_HTTP_TRACE_FILE=/path` (arquivo)
    - `SUITECLOUD_HTTP_TRACE_BODY=1` (snippets pequenos; evitar em flows sensíveis)

- `packages/node-cli/src/utils/http/CookieJar.js`:
  - Cookie jar minimalista por host (name=value).

- `packages/node-cli/src/core/sdkexecutor/NodeSdkExecutor.js`:
  - Implementa SDK command `deploy`.
  - Implementa `validate` com flag `-server` chamando `NetSuiteSdfDevFrameworkService.validateServer`.

## Research atualizado
- `.sangoi/research/sdf-deploy-validate-server.md` e `.sangoi/research/sdf-protocol.md`:
  - Documentado `mediafile`, mimetype `application/x-zip-compressed`, `applyinstallprefs` `T|F` e 2-step do `token=...` para deploy (via `~/.netsuite/sdf_source`).

## Testes
- `cd packages/node-cli && npm test`

## Validação (nota)
- Validação real (sandbox) executada em 2025-12-19:
  - `project:validate --server` e `project:deploy` funcionaram **quando** o token foi emitido com scope incluindo `restlets` (ex.: `"rest_webservices restlets"`).
  - Sintoma quando scope não inclui `restlets`: `idevalidationhandler.nl` respondeu HTML de login (“You must log in…”), com status `500`.
  - `account:setup:ci` exige `SUITECLOUD_CI_PASSKEY` (execution mode `AUTH_CI_SETUP`); sem isso o CLI bloqueia m2m auth por design.
  - Trace sanitizado (JSONL) útil via `SUITECLOUD_HTTP_TRACE=1` + `SUITECLOUD_HTTP_TRACE_FILE=...` (redact de Authorization/cookies/account ids).
