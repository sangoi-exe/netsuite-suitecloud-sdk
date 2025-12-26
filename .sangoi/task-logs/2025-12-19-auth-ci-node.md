# Task log — Auth CI (Node) + store de credenciais

Data: 2025-12-19

## Objetivo
Destravar comandos de conta no fork java-free, removendo a dependência do JAR para:
- `account:setup:ci` (OAuth2 client_credentials/JWT)
- `account:manageauth` (listar/info/rename/remove)
- `inspectauthorization` / `refreshauthorization` (pré-check e refresh automático)

## O que foi implementado
- `packages/node-cli/src/services/http/HttpClient.js`: client HTTP minimalista (http/https + proxy + redirects + JSON/form).
- `packages/node-cli/src/services/auth/JwtAssertionService.js`: geração de JWT PS256 (RSA-PSS) para client_credentials.
- `packages/node-cli/src/services/auth/NetSuiteDomainsService.js`: resolve datacenter domains via `GET /rest/datacenterurls?account=...`.
- `packages/node-cli/src/services/auth/NetSuiteCiAuthService.js`: fluxo `authenticateci` (domains → token → tokeninfo best-effort).
- `packages/node-cli/src/services/auth/AuthStoreService.js`: store local de auth IDs em `$SUITECLOUD_SDK_HOME/auth/auth-store.json`.
  - Tokens são persistidos **criptografados** quando houver passkey (`SUITECLOUD_CI_PASSKEY` ou `SUITECLOUD_FALLBACK_PASSKEY`).
  - Sem passkey, o store não grava `access_token` (e `inspectauthorization` vai exigir reauth).
- `packages/node-cli/src/core/sdkexecutor/NodeSdkExecutor.js`: adiciona comandos do SDK no engine Node:
  - `authenticateci`, `manageauth`, `inspectauthorization`, `refreshauthorization`.
- `packages/node-cli/src/SdkExecutor.js`: `sdkPath` passa a defaultar para `SdkHomeService.getSdkHomePath()` quando não é informado (mantém testes simples).

## Validação
- `cd packages/node-cli && npm test`

## Notas / limites atuais
- Implementado **apenas** o fluxo CI (client_credentials). `account:setup` (browser/OAuth code) continua pendente.
- `tokeninfo` é best-effort: se falhar, ainda assim o auth funciona, mas `companyName/roleName` podem cair em defaults.

