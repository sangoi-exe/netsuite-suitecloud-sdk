# Task log — Fix CI auth (client_id + JWT claims + accountId normalization)

Data: 2025-12-19

## Objetivo
Fazer `account:setup:ci` funcionar de verdade no fork java‑free (sem JAR) com OAuth2 client_credentials.

## Descobertas
- O endpoint `GET /rest/datacenterurls?account=...` rejeita `accountId` no formato `1234567-sb1` (com `-`) com `400 Company Id is invalid`, mas aceita `1234567_SB1` (com `_`).  
  → Precisa normalizar `-sb1`/`-rp1` para `_SB1`/`_RP1` **somente** para a chamada de datacenterurls.
- O token endpoint espera **`client_id`** no `application/x-www-form-urlencoded` e o JWT assertion segue o padrão:
  - header: `alg=PS256`, `kid=<certificateId>`
  - payload: `iss=<clientId>`, `aud=<.../oauth2/v1/token>`, `iat/exp`, `scope`
  - (não observamos necessidade de `sub` no payload; remover simplifica e ficou compatível com o JAR)

## Mudanças feitas
- `packages/node-cli/src/services/auth/NetSuiteDomainsService.js`:
  - normaliza `accountId` `-sb1/-rp1` → `_SB1/_RP1` para `datacenterurls`.
- `packages/node-cli/src/services/auth/JwtAssertionService.js`:
  - remove claim `sub` do JWT de client_credentials.
- `packages/node-cli/src/services/auth/NetSuiteCiAuthService.js`:
  - exige `clientId` (via `--clientid` ou env `SUITECLOUD_CLIENT_ID`)
  - envia `client_id` no form
  - JWT: `iss=clientId`, `kid=certificateId`, `scope` no payload
  - `datacenterurls` usa accountId normalizado (dash → underscore).
- `packages/node-cli/src/utils/AuthenticationUtils.js` + `packages/node-cli/src/metadata/SdkCommandsMetadataPatch.json`:
  - adiciona suporte opcional a `--clientid` em `account:setup:ci`.
- `packages/node-cli/src/core/sdkexecutor/NodeSdkExecutor.js`:
  - persiste `clientId` em `authConfig` e usa em refresh automático (`refreshauthorization` e `_ensureValidAccessToken`).

## Validação (real, sandbox)
- `NetSuiteCiAuthService.authenticateCi` passou a autenticar com sucesso contra uma conta sandbox local (IDs/tokens não registrados aqui).

## Testes
- `cd packages/node-cli && npm test`

