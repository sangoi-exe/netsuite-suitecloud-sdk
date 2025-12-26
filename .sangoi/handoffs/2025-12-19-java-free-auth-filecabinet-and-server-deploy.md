# Handoff — Java‑free auth + File Cabinet + bloqueio em deploy/validate server

Data: 2025-12-19

## Objetivo
Continuar a migração java‑free do `packages/node-cli`, removendo dependência do `cli-*.jar` no runtime e avançando para `project:deploy` / `project:validate --server` via rede (SDF).

## O que mudou (neste chunk)
### Auth CI (client_credentials) + store local
- Implementado `authenticateci` (base de `account:setup:ci`) 100% Node:
  - resolve domains via `GET /rest/datacenterurls?account=...`
  - obtém token via `POST /services/rest/auth/oauth2/v1/token`
  - best-effort `GET /rest/tokeninfo`
- Store local de auth IDs: `$SUITECLOUD_SDK_HOME/auth/auth-store.json`
  - tokens persistidos criptografados quando existir passkey (`SUITECLOUD_CI_PASSKEY` ou `SUITECLOUD_FALLBACK_PASSKEY`)
- `account:manageauth` java‑free (`--list`, `--info`, `--rename`, `--remove`)
- `inspectauthorization`/`refreshauthorization` java‑free (refresh automático para CI)

Arquivos principais:
- `packages/node-cli/src/services/auth/NetSuiteCiAuthService.js`
- `packages/node-cli/src/services/auth/AuthStoreService.js`
- `packages/node-cli/src/core/sdkexecutor/NodeSdkExecutor.js`

### File Cabinet java‑free
- `file:list` agora funciona sem JAR:
  - SDK commands `listfolders` + `listfiles` via REST Query Service (SuiteQL)
- `file:upload` agora funciona sem JAR:
  - SDK command `uploadfiles` via `POST /app/suiteapp/devframework/fileupload/filecabinetupload.nl` (multipart + `parentFolder`)

Arquivos principais:
- `packages/node-cli/src/services/netsuite/NetSuiteFileCabinetService.js` (SuiteQL list)
- `packages/node-cli/src/services/netsuite/NetSuiteFileCabinetUploadService.js` (upload multipart)

### Correções importantes descobertas no “mundo real”
- `datacenterurls` aceita sandbox/release-preview em `_SB1/_RP1` (underscore); agora normalizamos automaticamente quando o usuário fornece `-sb1/-rp1`.  
  (Implementado em `packages/node-cli/src/services/auth/NetSuiteDomainsService.js`.)
- Token request de client_credentials precisa de:
  - `client_id` no form body
  - JWT com `iss=<clientId>` e `kid=<certificateId>` (sem `sub`)  
  (Implementado em `packages/node-cli/src/services/auth/NetSuiteCiAuthService.js`.)
- `account:setup:ci` agora aceita `--clientid` (ou env `SUITECLOUD_CLIENT_ID`).  
  (Metadata/cli: `packages/node-cli/src/metadata/SdkCommandsMetadataPatch.json`.)
- `project:validate --server` / `project:deploy` via `ide*handler.nl` exigiram (sandbox) token com scope incluindo `restlets` (ex.: `"rest_webservices restlets"`).  
  (Disponível via `account:setup:ci --scope ...` ou env `SUITECLOUD_SCOPES`/`NS_SCOPES`.)

## Como usar (java‑free)
Pré-requisitos:
- `SUITECLOUD_SDK_HOME` apontando para um diretório gravável.
- `SUITECLOUD_CI_PASSKEY` (necessário para liberar m2m auth; também criptografa tokens persistidos).
- `clientId` do Integration record + `certificateId` do Certificate record + private key PEM.

Exemplo:
```bash
export SUITECLOUD_SDK_HOME="$HOME/.netsuite/suitecloud-sdk"
export SUITECLOUD_CI_PASSKEY="uma-passkey-forte"
export SUITECLOUD_CLIENT_ID="<clientId>"

suitecloud account:setup:ci --account "<accountId-sb1-ou-_SB1>" --authid ci --certificateid "<certificateId>" --privatekeypath "$HOME/.netsuite/ns_m2m_private.pem" --scope "rest_webservices restlets"
suitecloud account:manageauth --list
suitecloud file:list
suitecloud file:upload
```

Obs:
- `account:setup` (browser/OAuth code) ainda depende do comando SDK `authenticate` e não está implementado no engine Node.

## Como validar
- Testes unitários: `cd packages/node-cli && npm test`
- Validação manual (sandbox): autenticar via `account:setup:ci` e rodar `file:list`/`file:upload`.
- Validação manual (sandbox, SDF server): `suitecloud project:validate --server` e `suitecloud project:deploy` (exige scope com `restlets`).

## Riscos / limitações conhecidas
- `project:deploy` e `project:validate --server` via handlers `ide*handler.nl` foram validados em sandbox, mas dependem de scopes corretos (inclua `restlets`); sem isso, observamos resposta HTML de login (“You must log in…”). Para depurar variações por tenant (cookies/anti-bot etc.), use `SUITECLOUD_HTTP_TRACE=1`.
- `object:update` continua pendente (precisa ser reimplementado sem JAR).
- Não registrar tokens/cookies/traces não-sanitizados em git.

## Próximos passos (follow-up detalhado)
### 1) Fechar spec do deploy/validate server (sem “copiar Oracle”)
Referências:
- `.sangoi/research/sdf-protocol.md`
- `.sangoi/research/sdf-deploy-validate-server.md`
- `.sangoi/task-logs/2025-12-19-server-deploy-validate-probing.md`

O que falta descobrir (ordem sugerida):
1. Confirmar em sandbox (com trace sanitizado) o comportamento real quando os handlers respondem `200` com body vazio:
   - se é obrigatório warm-up/sessão/cookies além de Bearer
   - se há outros campos obrigatórios além de `mediafile` + `accountspecificvalues` + `applyinstallprefs`
2. Formato e semântica do response (lista de linhas vs XML `<ide>` vs download de log) e como mapear em output do CLI.
3. `deployContext`: formato e campos (se existir/for obrigatório em deploy).

Como capturar com baixo risco:
- Rodar com `SUITECLOUD_HTTP_TRACE=1` (fork Node) em conta sandbox e salvar o trace (sanitizado) fora do repo.
- (Opcional) Rodar o JAR oficial fora do repo (Windows ou Linux com Java) em conta sandbox e capturar tráfego via proxy para comparar.
- Sanitizar (remover `Authorization`, cookies, account ids, emails) e versionar apenas fixtures/traces limpos em `.sangoi/research/`.

### 2) Hardening do client Node de deploy/validate
Depois da spec:
- Ajustar o client (`NetSuiteSdfDevFrameworkService`) para:
  - suportar warm-up/sessão se for exigido
  - suportar polling/async job se o server devolver job id/artefato
  - mapear erros de forma estruturada (não só “unknown response”)

### 3) `object:update`
- `object:list` e `object:import` foram reimplementados via `ide.nl` (ver task log em `.sangoi/task-logs/`).
- Falta `object:update` (e `includeinstances` para custom records).
