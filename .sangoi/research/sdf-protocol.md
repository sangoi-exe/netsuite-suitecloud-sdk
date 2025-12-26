# Research — SDF/SuiteCloud protocol (jar reconnaissance)

Data: 2025-12-19

Este documento captura descobertas **sem decompilar** o JAR (somente strings/arquivos `.properties` e constantes UTF‑8 do constant pool).
Objetivo: ter uma “spec viva” para implementar `SdfClient` em Node (deploy/validate/upload/auth) sem depender de Java/JAR no fork.

## Como reproduzir
Assumindo que você tem o JAR oficial localmente (não versionar no repo):
```bash
export SUITECLOUD_ORACLE_JAR_PATH="$HOME/.netsuite/cli-2025.1.0.jar"
node .sangoi/.tools/jar-inspect.mjs
```

Para extrair strings de um `.class` específico:
```bash
node .sangoi/.tools/jar-class-strings.mjs --class com/netsuite/ide/core/authentication/AuthConstants.class
```

## Endpoints descobertos

### OAuth2 / Auth
Fonte: `com/netsuite/ide/core/authentication/AuthConstants.class` (strings).
- `GET /app/login/oauth2/authorize.nl`
- `POST /services/rest/auth/oauth2/v1/token`
- Parâmetros/claims vistos como strings:
  - `grant_type` (`authorization_code`, `client_credentials`, `refresh_token`)
  - `client_id`
  - `redirect_uri`, `code`, `scope`
  - PKCE: `code_challenge`, `code_challenge_method`, `code_verifier`
  - JWT client assertion: `client_assertion`, `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer`

Fonte: `rest.endpoint.properties`.
- `POST /services/rest/auth/oauth2/v1/introspect`

JWT client assertion (client_credentials):
- Algoritmo visto no JAR: `PS256` (string em `JWTAssertion.class`)
- Header keys: `alg`, `kid`, `typ` (strings em `JWTHeader.class`)
- Payload keys: `aud`, `iss`, `scope`, `iat`, `exp` (strings em `JWTPayload.class`)
- Contexto do JAR sugere:
  - `kid = certificateId` (strings em `AuthenticateClientCredentialsContext.class`)
  - `iss = clientId` (strings em `AuthenticateClientCredentialsContext.class`)
  - `scope` no payload (string em `JWTPayload.class`)
  - Não vimos evidência forte de `sub` ser exigido para este fluxo.

Observação: em versões diferentes do SDK pode existir um endpoint de “authorize token” (ex.: `authorizetoken.nl`), mas nesta versão não encontramos esse path via busca simples; manter como hipótese a confirmar por traces.

### Datacenter URLs (descobrir domains)
Fonte: `com/netsuite/ide/core/authentication/service/DatacenterDomainsServiceImpl.class` (strings).
- `GET /rest/datacenterurls?account=%s`

Nota prática (observado em sandbox): `datacenterurls` aceita sufixos de ambiente no formato `_SB1`/`_RP1`. Se o usuário informar `-sb1`/`-rp1`, normalizar para underscore antes de chamar o endpoint.

Modelo de resposta (campos):
Fonte: `com/netsuite/ide/core/authentication/domain/Domains.class` (strings).
- `restDomain`
- `systemDomain`
- `webservicesDomain`

### Token info
Fonte: `rest.endpoint.properties` + `TokenInfoRequest.class` (strings).
- `GET /rest/tokeninfo`
- Request shape (strings): `url`, `accountId`, `accessToken`

### File Cabinet
Fonte: `rest.endpoint.properties`.
- `GET/POST /rest/filecabinetfolderinfo` (precisa confirmar método)

### Upload de arquivos (File Cabinet upload)
Fonte: `app.endpoint.paths.properties` + `FileCabinetUploadService.class` (strings).
- `POST /app/suiteapp/devframework/fileupload/filecabinetupload.nl`
- Auth: Header `Authorization: Bearer <token>` (strings em `FileCabinetUploadService.class` e `OAuth2Header.class`)
- Upload: multipart/form-data (há string `file` e `fileToUpload`; confirmar campos adicionais como `fileCabinetPath`).

Achados adicionais (strings):
- Query param: `parentFolder` (provável: file cabinet path do diretório pai, ex.: `/SuiteScripts`)
- Multipart field: `file` (provável: conteúdo do arquivo)

Response shape (campos vistos como strings):
- `FileCabinetUploadResponse.class`: `parentFolderId`, `parentFolderName`, `fileId`, `fileName`, `action`, `error`
- `FileCabinetUploadError.class`: `code`, `message`

### Import Files (download) — `file:import` / `importfiles`
Fonte: `~/.netsuite/sdf_source` (constant pool / constantes em classes):
- Servlet: `POST /app/ide/ide.nl` (`AbstractSuiteCloudService.SERVLET_IDE`)
- Campos do request (multipart/form-data):
  - `action=ImportFiles` (`DownloadFiles.ACTION_VALUE`)
  - `files=<xml>` (`DownloadFiles.PARAM_FILES`)

Wire format do `files` (XML):
- Envia um XML com raiz `<media>` e lista de `<file>` dentro de `<files>`:
  - `<path>`: file cabinet path (ex.: `/SuiteScripts/foo.js`)
  - `<content>true</content>`: baixar conteúdo do arquivo
  - `<attributes>true|false</attributes>`: baixar `.attributes` (quando `excludeproperties` não foi usado)

Response:
- Body é um ZIP (content-type observado: `application/octect-stream;charset=utf-8`) contendo:
  - `status.xml`: `<status><result><path>...<loaded>true|false</loaded><message>...</message></result></status>`
  - arquivos com paths **relativos ao projeto**, ex.: `FileCabinet/SuiteScripts/foo.js` (e possivelmente `.attributes/...`)

Nota prática (sandbox):
- Assim como `ide*handler.nl`, o endpoint `/app/ide/ide.nl` exige token OAuth2 com scope incluindo `restlets` (ex.: `"rest_webservices restlets"`).

### Custom Objects (object:list / object:import)
Fonte: strings em delegates/handlers (constant pool).
- Servlet: `POST /app/ide/ide.nl`
- `object:list` (`listobjects`):
  - Multipart fields:
    - `action=FetchCustomObjectList`
    - `package_root=<...>` (observado como string no JAR; provável root do package no File Cabinet, ex.: `/SuiteScripts` ou `/SuiteApps/<appId>`)
    - `object_type=<type>` (pode repetir para múltiplos tipos)
    - `scriptid_contains=<substring>` (filtro opcional)
  - Response: XML (provável) com lista de objetos, ex.: `<customObjects><customObject type="..." scriptId="..." appId="..."/></customObjects>`.
  - Semântica do `appid` no CLI: se omitido, listar apenas objetos sem `appId`; se informado, filtrar por match exato (o filtro pode ser local).
- `object:import` (`importobjects`):
  - Multipart fields:
    - `action=FetchCustomObjectXml`
    - `package_root=<...>` (string no JAR; ver nota acima)
    - `custom_objects=<xml>`
    - `mode=UPDATE` (somente para `object:update`; ver abaixo)
  - Wire format do `custom_objects` (XML):
    - raiz `<customObjects>` com `<customObject type="..." scriptId="..." appId="..."/>`.
  - Response: ZIP contendo:
    - `status.xml` com `<result>` por objeto (campos observados como strings: `key`, `type`, `message`)
    - arquivos `.xml` dos objetos (conteúdo SDF), a serem gravados em `destinationfolder` sob `Objects/`.

Nota prática (sandbox):
- O endpoint `/app/ide/ide.nl` pode exigir token OAuth2 com scope incluindo `restlets` (ex.: `"rest_webservices restlets"`).

### Object Update (object:update / includeinstances)
Fonte: strings no JAR (constant pool) — handlers `UpdateObjectHandler` / `UpdateCustomRecordWithInstancesHandler` e delegates relacionados.

- `object:update` (SDK command `update`):
  - Reusa `POST /app/ide/ide.nl` com `action=FetchCustomObjectXml`
  - Envia `mode=UPDATE` (string no JAR: `FetchCustomObjectXmlDelegate$Mode.UPDATE`)
  - Response: ZIP com `status.xml` + XMLs atualizados (sobrescreve os objetos existentes no projeto).

- `includeinstances` para custom records (SDK command interno `updatecustomrecordwithinstances`):
  - Endpoint: `POST /app/ide/fetchcustomrecordwithinstancesxml.nl`
  - Fields (provável `application/x-www-form-urlencoded`):
    - `scriptid=<customrecord...>`
    - `appid=<...>` (opcional; string no JAR)
  - Response: ZIP contendo o custom record type e as instâncias (`customrecord`) para extração no projeto.

### Deploy/Preview/Server validation (SuiteApp Dev Framework handlers)
Fonte: strings em delegates:
- `POST /app/suiteapp/devframework/ideinstallhandler.nl` (DeployDelegate)
- `POST /app/suiteapp/devframework/idepreviewhandler.nl` (PreviewDelegate)
- `POST /app/suiteapp/devframework/idevalidationhandler.nl` (ServerValidationDelegate)

Strings relevantes:
- `DeployDelegate.class`: `deployContext`, `deployToken`, `token=`, `accountspecificvalues`
- `AbstractSuiteCloudService.class`: `mediafile`, `accountspecificvalues`, `applyinstallprefs`, `/app/ide/ide.nl`

Multipart/request fields (via `~/.netsuite/sdf_source`):
- `mediafile`: zip do projeto (`PARAM_MEDIAFILE = "mediafile"`, mimetype `application/x-zip-compressed`)
- `accountspecificvalues`: `ERROR|WARNING` (default `ERROR`)
- `applyinstallprefs`: `T|F` (boolean)
- `deployContext`: payload de contexto para deploy (ainda precisa fechar formato)

Auth nestes handlers (via `sdf_source`):
- Header `Authorization: Bearer <access_token>` (ver `AbstractAuthenticatedDelegate`)
- Header `Sdf-Action: deploy|preview|validate` (ver `SdfCommands`)
- Deploy pode exigir 2-step com `?token=<deployToken>` quando response inclui `token=...` (ver `DeployDelegate`)

Nota prática (sandbox):
- `ide*handler.nl` pode exigir token com scope incluindo `restlets` (ex.: `"rest_webservices restlets"`). Sem isso, observamos resposta HTML de login (“You must log in…”).

## Fluxo provável (alto nível)
1. Resolver domains via `GET /rest/datacenterurls?account=<ACCOUNT_ID>` → `restDomain`, `systemDomain`, `webservicesDomain`.
2. Obter OAuth2 access token em `POST /services/rest/auth/oauth2/v1/token` (client_credentials + JWT assertion, ou authorization_code + PKCE).
3. (Opcional) Introspect token: `POST /services/rest/auth/oauth2/v1/introspect`.
4. Upload de zip/arquivos via `POST /app/suiteapp/devframework/fileupload/filecabinetupload.nl` (Bearer).
5. Deploy/preview/validate server via handlers `ide*handler.nl` (precisa confirmar payload e como o token é enviado).

## Lacunas (o que falta descobrir)
- Payload exato (multipart fields) para:
  - `ideinstallhandler.nl` (deploy)
  - `idepreviewhandler.nl` (preview)
  - `idevalidationhandler.nl` (server validation)
- Se o token é enviado por `Authorization: Bearer` ou `?token=` (ou ambos).
- Schema das respostas (success/error) desses handlers.
- Comportamento observado: chamadas diretas aos `ide*handler.nl` com `Authorization: Bearer` + `mediafile` retornaram `200` com body vazio (`content-length: 0`). Ver detalhes em `.sangoi/research/sdf-deploy-validate-server.md`.

Próximo passo sugerido:
- Extrair strings dos handlers/services relacionados a `DeployDelegate` e `AbstractSuiteCloudService` e mapear nomes de campos (ex.: `deployContext`, `mediafile`, `zip`, etc.).
- Rodar um proxy (sandbox) com um JAR oficial **fora do repo** para capturar request/response sanitizados e fechar a spec.
