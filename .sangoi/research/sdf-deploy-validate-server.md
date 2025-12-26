# Research — Server deploy/validate via `ide*handler.nl`

Data: 2025-12-19

## Contexto
Para remover o JAR, precisamos reimplementar o “caminho de rede” do SDF.
Os comandos `project:deploy` e `project:validate --server` parecem usar handlers `.nl` do SuiteApp Dev Framework.

Endpoints (via `~/.netsuite/sdf_source` / constant pool):
- `/app/suiteapp/devframework/ideinstallhandler.nl` (deploy)
- `/app/suiteapp/devframework/idepreviewhandler.nl` (preview/dryrun)
- `/app/suiteapp/devframework/idevalidationhandler.nl` (server validation)
- Também existe `/app/ide/ide.nl` (servlet “ide”) e há strings `SERVLET_IDE_ACTION_KEY`/`action` no JAR.

Campos/strings relevantes (constant pool):
- Multipart:
  - `mediafile` (zip do projeto) — `PARAM_MEDIAFILE = "mediafile"`
  - mimetype do zip (const): `application/x-zip-compressed`
- Parâmetros/flags:
  - `accountspecificvalues`
  - `applyinstallprefs`
  - `logFileLocation`
  - `deployContext`
  - `deployToken`
  - `token=` (deploy token label/marker)
- Headers:
  - `User-Agent`
  - `Sdf-Action`

## Update (java-free, spec por `sdf_source` + implementação Node)
**Achado chave:** o SDK Java sempre envia `applyinstallprefs` como `T`/`F` (não `true/false`) e sempre inclui `accountspecificvalues` (default `ERROR`).

**Scopes (importante):**
- Observação real (sandbox): `project:validate --server` e `project:deploy` via `ide*handler.nl` **falham** se o token OAuth2 não incluir `restlets`.
- Sintoma: resposta HTML (login) com mensagem “You must log in…”, mesmo com `Authorization: Bearer ...`.
- Fix: emitir token com scope `"rest_webservices restlets"` (ex.: via `account:setup:ci --scope "rest_webservices restlets"` ou env `SUITECLOUD_SCOPES`/`NS_SCOPES`).

**Deploy token:**
- `DeployDelegate.DEPLOY_TOKEN_LABEL = "token="` (o “marker” de token vem no body).
- Quando o response contém uma linha começando com `token=...`, o SDK Java extrai o valor e reenvia o deploy com query `?token=<deployToken>`.

**Anti-bot / cookies:**
- Observação prática (sandbox): o server pode devolver `200` + body vazio e setar cookies (ex.: `bm_sz`).
- Implementação Node faz 1 retry automático quando recebe body vazio *e* vem `set-cookie` na resposta.

**Tooling de debug:**
- `SUITECLOUD_HTTP_TRACE=1` registra trace sanitizado (request/response metadata) para diagnosticar o wire format sem vazar segredos.

## Experimento (sandbox)
Chamadas diretas com Bearer token + multipart `mediafile` retornaram:
- HTTP 200
- `content-length: 0`
- body vazio

Mesmo requests inválidos receberam body vazio, o que sugere que:
- o handler exige uma etapa anterior (ex.: token), ou
- há proteção/anti-bot, ou
- a resposta “real” é entregue por outro mecanismo (ex.: log file).

## Lacunas (o que falta fechar)
1. Como obter `deployToken` (se for obrigatório) e como anexar (`?token=`? field?).
2. Formato exato do `deployContext` (se existir; pode ser JSON/XML/string).
3. Response format (lista de linhas? XML `<ide>...</ide>`?).
4. Se há necessidade de cookies/sessão além de Bearer token.

## Próximo passo recomendado (spec-first)
Rodar o JAR oficial (fora do repo) com proxy em conta sandbox e capturar:
- request completo (method/url/headers/body)
- response completo (status/headers/body)
Sanitizar (remover tokens/cookies/account ids) antes de versionar.
