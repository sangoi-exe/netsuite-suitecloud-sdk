# Changelog

## 2026-02-11
- `packages/node-cli`: implementa `account:setup` java-free via SDK command `authenticate` (OAuth2 authorization_code + PKCE), com browser launch, callback local `127.0.0.1:52300-52315` e troca de token em `/services/rest/auth/oauth2/v1/token`.
- `packages/node-cli`: adiciona `NetSuitePkceAuthService` e suporte a refresh token grant para auth `type: PKCE`.
- `packages/node-cli`: `refreshauthorization` e `_ensureValidAccessToken` agora suportam `PKCE` além de `CLIENT_CREDENTIALS`.
- `packages/node-cli`: endurece segurança do store local de auth IDs (`AuthStoreService`) para também tratar `refreshToken` como segredo (strip/encrypt/decrypt).
- `packages/node-cli`: adiciona cobertura de testes para fluxo PKCE (`NetSuitePkceAuthService`, `authenticate` command, refresh de PKCE em comandos runtime).
- `packages/node-cli`: corrige `project:adddependencies` para não forçar `-all` quando o usuário passa refs seletivas (`--feature`/`--file`/`--object`).
- `packages/node-cli`: ajusta precedência de `client_id` no `account:setup` (explícito → env vars → `suitecloud-sdk-settings.json` → default por domínio).
- `packages/node-cli`: `_ensureValidAccessToken` agora rejeita tipos de auth não suportados mesmo quando há token não expirado.
- `packages/node-cli`: externaliza mensagens de erro OAuth/PKCE para `TranslationKeys` + `messages.json` (browser launch, timeout, callback, exchange/refresh failures), removendo hardcoded strings do serviço PKCE.
- `packages/node-cli`: `project:adddependencies -all` agora cobre categorias adicionais inferidas por qualifiers (`bundles`, `files`, `folders`, `platformextensions`) com merge/dedupe/idempotência em `manifest.xml`.
- `packages/node-cli`: `project:adddependencies -all` deixa de materializar `platformextensions` para o próprio SuiteApp (`appid` igual ao `selfAppId`), mantendo comportamento consistente com o filtro já aplicado para objetos de aplicação.
- `packages/node-cli`: `AddDependenciesOutputHandler` passa a renderizar dependências de `BUNDLE`.

## 2025-12-19
- `packages/node-cli`: remove dependência de Java/JAR e toda a lógica de download/execução do SDK Oracle.
- `packages/node-cli`: implementa `account:setup:ci`/`account:manageauth` (e `inspectauthorization`/`refreshauthorization`) via engine Node, com store local de auth IDs em `$SUITECLOUD_SDK_HOME/auth/auth-store.json` (tokens criptografados via `SUITECLOUD_CI_PASSKEY`/`SUITECLOUD_FALLBACK_PASSKEY`). `account:setup:ci` agora aceita `--clientid` (ou env `SUITECLOUD_CLIENT_ID`) e normaliza `accountId` `-sb1/-rp1` → `_SB1/_RP1` para `datacenterurls`.
- `packages/node-cli`: `account:setup:ci` agora aceita `--scope` e também respeita env vars `SUITECLOUD_SCOPE`/`SUITECLOUD_SCOPES`/`NS_SCOPES` (necessário em alguns tenants para incluir `restlets` e destravar `project:validate --server` / `project:deploy` nos handlers `ide*handler.nl`).
- `packages/node-cli`: implementa `file:list` java-free via `listfolders`/`listfiles` (SuiteQL/REST Query Service) usando o auth CI armazenado.
- `packages/node-cli`: implementa `file:upload` java-free via `uploadfiles` (multipart + `filecabinetupload.nl` com Bearer token).
- `packages/node-cli`: implementa `file:import` java-free via `importfiles` (`POST /app/ide/ide.nl` com `action=ImportFiles` + `files=<xml>`) e extrai o ZIP (`status.xml` + arquivos) para `FileCabinet/` e `.attributes/`.
- `packages/node-cli`: implementa `project:create` em Node (gera estrutura + `manifest.xml`/`deploy.xml` e prefs de SuiteApp).
- `packages/node-cli`: implementa `project:package` em Node (zip a partir de `deploy.xml`) — base para migração java-free.
- `packages/node-cli`: implementa `file:create` em Node (gera skeleton SuiteScript e injeta módulos opcionalmente).
- `packages/node-cli`: implementa `project:validate` local em Node (output estruturado com warnings/errors e exit code != 0 quando há erros).
- `packages/node-cli`: implementa `project:validate --server` e `project:deploy` via handlers do SuiteApp Dev Framework (`/app/suiteapp/devframework/ide*handler.nl`) usando Bearer token, `Sdf-Action` e multipart `mediafile` + parâmetros (`accountspecificvalues`, `applyinstallprefs`).
- `packages/node-cli`: adiciona cookie jar opcional + retry (1x) quando response vem `200` com body vazio e `set-cookie` (para compatibilidade com proteções/anti-bot).
- `packages/node-cli`: adiciona HTTP trace sanitizado via env vars `SUITECLOUD_HTTP_TRACE`, `SUITECLOUD_HTTP_TRACE_FILE`, `SUITECLOUD_HTTP_TRACE_BODY`.
- `packages/node-cli`: implementa preview local de deploy (`project:deploy --dryrun`) via SDK command `preview`.
- `packages/node-cli`: corrige ciclo de dependência `NodeTranslationService` ↔ `FileUtils` que quebrava `require()` de vários comandos.
- `packages/node-cli`: corrige paths de projeto (`FOLDERS.*` não são mais absolutos) e normaliza `ProjectInfoService` para retornar strings (não arrays).
- `packages/node-cli`: `file:create` protege contra path traversal (garante escrita dentro de `FileCabinet/`).
- `packages/node-cli`: adiciona flags globais `--debug` e `--verbose` (e env vars `SUITECLOUD_DEBUG`/`SUITECLOUD_VERBOSE`) e melhora logs de timing/diagnóstico.
- `packages/node-cli`: em `--debug/--verbose`, prefixa erros com o nome do comando para localizar a falha mais rápido.
- `packages/node-cli`: logger do console deixa de depender de Promise para imprimir (evita “sumir” logs/erros quando o Node encerra rápido).

## 2025-12-20
- `packages/node-cli`: implementa `object:list` e `object:import` java-free via `/app/ide/ide.nl` (`FetchCustomObjectList` / `FetchCustomObjectXml`) e extrai o ZIP retornado (`status.xml` + objetos) para o `destinationfolder` sob `Objects/` (defesa contra path traversal).

## 2025-12-26
- `packages/node-cli`: implementa `object:update` java-free via `/app/ide/ide.nl` (`FetchCustomObjectXml` com `mode=UPDATE`), sobrescrevendo os XMLs no projeto (preserva subpastas existentes sob `Objects/` quando o ZIP vem só com filenames).
- `packages/node-cli`: implementa `includeinstances` para custom records via `POST /app/ide/fetchcustomrecordwithinstancesxml.nl` (response ZIP) e extração segura para o projeto.
- `packages/node-cli`: completa `NodeSdkExecutor` para `listobjects`/`importobjects`/`update`/`updatecustomrecordwithinstances` + adiciona/atualiza testes unitários.
- `packages/node-cli`: `object:import` agora baixa SuiteScripts referenciados para projetos ACP quando importar `customscript*` e o usuário não passa `-excludefiles` (detecta paths no XML importado e chama `ImportFiles`).
- `packages/node-cli`: implementa `project:adddependencies` java-free via SDK command `adddependencies` (atualiza `manifest.xml` com dependencies descobertas em `Objects/` e features comuns).
