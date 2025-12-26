# Task log — Probing `project:deploy` / `project:validate --server` (handlers `ide*handler.nl`)

Data: 2025-12-19

## Objetivo
Implementar `deploy`/`validate` no fork java‑free via os handlers do SuiteApp Dev Framework:
- `/app/suiteapp/devframework/ideinstallhandler.nl`
- `/app/suiteapp/devframework/idepreviewhandler.nl`
- `/app/suiteapp/devframework/idevalidationhandler.nl`

## Estado atual
Auth CI (Bearer token) está OK e conseguimos:
- obter `systemDomain`/`restDomain` via `datacenterurls`
- obter `access_token` via OAuth2 client_credentials
- gerar ZIP do projeto via `ProjectPackagingService` (java‑free)

## Experimentos executados (sandbox)
Tentativas diretas com `fetch()` (Node 22) usando:
- `Authorization: Bearer <access_token>`
- multipart com `mediafile=<zip>` (mimetype `application/x-zip-compressed`)
- (variações) incluir campos `accountspecificvalues=ERROR`
- (variações) headers `Sdf-Action: preview|validate`, `User-Agent` “SuiteCloud SDK” e UA de browser
- (variações) reusar cookie `bm_sz` retornado (Akamai)

Endpoints testados:
- `POST https://<systemDomain>/app/suiteapp/devframework/idepreviewhandler.nl`
- `POST https://<systemDomain>/app/suiteapp/devframework/idevalidationhandler.nl`
- `POST https://<restDomain>/app/suiteapp/devframework/idevalidationhandler.nl` (só para confirmar; mesmo resultado)

Resultado consistente:
- HTTP `200`
- `content-type: text/plain;charset=utf-8`
- `content-length: 0` (body vazio)
- Mesmo enviando um multipart obviamente inválido, a resposta continuou vazia.

Também tentamos:
- `GET/POST https://<systemDomain>/app/ide/ide.nl` com `action=deploy` (via query e via form) → `400 Bad Request` com body `"Bad Request"`.

## Interpretação / hipóteses
Os handlers parecem exigir algo além de “Bearer + mediafile”:
- Provável necessidade de **`deployToken`** / `token=<...>` (há strings `deployToken` e `token=` no `DeployDelegate` do JAR).
- Possível necessidade de parâmetros extras (strings vistas): `deployContext`, `accountspecificvalues`, `applyinstallprefs`, `logFileLocation`.
- Possível bloqueio por proteção anti‑bot (Akamai): o server sempre seta `bm_sz`, e pode exigir challenge/JS — mas mesmo com cookie o body segue vazio.
- Alternativamente, o handler pode estar “ack” sem payload quando falta token e escrever a saída em outro lugar (ex.: log file), mas não vimos nenhum indício na resposta.

## Próximos passos sugeridos
1. Fechar a spec do request **observando o wire format real**:
   - Rodar o JAR oficial em um ambiente com Java (fora do repo) e capturar tráfego via proxy (sandbox).
   - Sanitizar e versionar apenas traces sem segredos em `.sangoi/research/` (sem copiar código).
2. Mapear a etapa “get deploy token”:
   - Identificar qual request antecede os `ide*handler.nl` e retorna `token=...`.
   - Implementar essa etapa no Node e só então chamar deploy/validate/preview.
3. Só depois plugar no CLI:
   - Implementar comandos SDK `deploy` e `validate` (modo server) no `NodeSdkExecutor`
   - Ajustar parsing do response (provavelmente lista de linhas) para manter compatibilidade com `DeployOutputHandler`/`ValidateOutputHandler`.

