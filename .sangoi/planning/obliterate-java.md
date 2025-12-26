# Plan — Java‑free SuiteCloud SDK (Node)

Data: 2025-12-19

## Objetivo
Entregar um SDK/CLI **100% Node.js** para SuiteCloud (SDF) que:
- Não baixa/executa JAR e não depende de `java` em nenhum ambiente (WSL/Linux/Windows/macOS).
- Mantém (ou melhora) a UX do CLI atual (interativo + não-interativo).
- É testável, determinístico e seguro (sem vazamento de tokens/PII em logs).

## Restrições importantes (produto/portfólio)
- **Não redistribuir** artefatos Oracle (JAR, classes, `sdf_source`, etc.). A implementação deve ser “clean-room” na prática: spec primeiro, código depois.
- Operações de integração **sempre** contra sandbox/conta controlada; nada de testes que mutem produção.
- Priorizar compatibilidade de outputs/exit codes (quem usa CLI depende disso em CI).

## Estado atual (repo)
- O `packages/node-cli` já tem: parser/registro de comandos, input handlers, output handlers e validações locais.
- Java/JAR foram removidos do fork; o “core” do SDK está sendo reimplementado em Node por fases.

Status no fork (2025-12-19):
- ✅ Executor Node-only (sem Java/JAR)
- ✅ `account:setup:ci` + `account:manageauth` java-free (OAuth2 client_credentials + store local; requer `--clientid` ou `SUITECLOUD_CLIENT_ID`)
- ✅ `project:create` java-free (estrutura + manifest/deploy/prefs)
- ✅ `project:package` java-free (zip a partir de `deploy.xml`)
- ✅ `file:create` java-free (skeleton + módulos)
- ✅ `file:list` java-free (lista pastas/arquivos do File Cabinet via REST Query Service/SuiteQL)
- ✅ `file:upload` java-free (upload multipart para `filecabinetupload.nl` com Bearer token)
- ✅ `project:validate` java-free (local, com output estruturado)
- ✅ `project:deploy --dryrun` java-free (preview local de entradas via `deploy.xml`)
- ⏳ Próximo: `deploy/validate` via `SdfClient` Node (protocolo/rede/auth). Bloqueio atual: chamadas diretas aos `ide*handler.nl` retornam `200` com body vazio; ver `.sangoi/research/sdf-deploy-validate-server.md`.

Comandos existentes no metadata do CLI:
- `account:manageauth`, `account:setup`, `account:setup:ci`
- `project:create`, `project:adddependencies`, `project:deploy`, `project:validate`, `project:package`
- `file:create`, `file:list`, `file:upload`, `file:import`
- `object:list`, `object:import`, `object:update`

## Arquitetura proposta (java-free)

### 1) Separar “Engine” do CLI (camada de execução)
Introduzir uma interface de execução (ex.: `SdkEngine`) com operações equivalentes às do SDK:
- `deploy()`, `validate()`, `package()`, `addDependencies()`
- `file.list/upload/import`
- `object.list/import/update`
- `auth.manage/setup/setupCi`

Implementações:
- `NodeEngine` (alvo final)
- (Opcional, dev-only, fora do runtime do fork) um harness externo para comparar outputs contra o JAR oficial durante a engenharia reversa.

Benefícios:
- Mantém o CLI e os handlers quase intactos enquanto o core é reescrito.
- Permite um “compat harness”: rodar as duas engines e comparar resultados (sem copiar código Oracle).

### 2) Cliente SDF em Node (rede + auth)
Criar um `SdfClient` (HTTP) com:
- Proxy (`SUITECLOUD_PROXY`), timeouts, retries com backoff, cancelamento.
- Session/cookies/CSRF (se o protocolo exigir).
- Polling de jobs assíncronos (deploy/validate/import) com progress.
- Download de logs/artefatos e normalização de mensagens.

Auth:
- `AuthStore` (IDs, domínios, roles, refresh/expiry, etc.).
- `AuthProviders`:
  - CI-first (tokens/keys).
  - Interativo (device-code flow ou callback local) — só depois que CI estiver sólido.

### 3) Modelo de projeto e empacotamento local
Sem rede:
- Parser/validator de `project.json`, `manifest.xml`, `deploy.xml`, `locking.xml`, `hiding.xml`.
- File walker que gera a lista exata de arquivos para upload.
- Zip determinístico (ordem estável, timestamps controlados) para CI reproducível.

### 4) Contratos de saída (compatibilidade)
Padronizar:
- Exit codes por categoria (auth/network/validation/conflict).
- Estrutura do output em modo “integration” (JSON) e modo humano.
- Mensagens e chaves (reaproveitar `messages.json` quando fizer sentido).

## Estratégia de engenharia reversa (sem “copiar Oracle”)
Ordem sugerida (spec-first):
1. **Inventário de comandos**: quais endpoints/operações cada comando dispara.
2. Capturar “wire format” por observação:
   - Strings/recursos dentro do JAR (URLs, paths, headers).
   - Traces de request/response em ambiente sandbox (proxy/MITM, quando permitido).
   - Saída do JAR em “integrationMode” para entender semântica/erros.
3. Escrever specs em `.sangoi/research/` (payloads, exemplos, códigos de erro) **sem trechos de código decompilado**.
4. Implementar Node `SdfClient` a partir da spec + fixtures.

Checklist de pesquisa (prático):
- Extrair o JAR (`jar xf` / `unzip`) e procurar:
  - Domínios/paths (`system.netsuite.com`, `*.app.netsuite.com`, `/services/`, `/rest/`, etc.).
  - Nomes de operações (“deploy”, “validate”, “import”, “filecabinet”, “manifest”, “job”, “status”).
  - Headers e parâmetros recorrentes (CSRF, `NLAuth`, OAuth, cookies).
- Montar uma tabela por comando:
  - Pré-condições locais (arquivos obrigatórios, flags que alteram payload).
  - Requests (method + url + headers + body schema).
  - Responses (success + erros + estados intermediários de polling).
  - Side effects (arquivos de log baixados, diretórios criados).
- Captura dinâmica (só sandbox):
  - Configurar um proxy e rotear tráfego do cliente (JAR) através dele.
  - Sanitizar traces (remover `Authorization`, cookies, account ids, emails) antes de salvar em `.sangoi/research/traces/`.

Observação: a parte mais crítica para portfólio é a disciplina “spec-first + testes de contrato”, não o truque de capturar tráfego em si.

## Tooling planejado (para acelerar paridade)
- `tools/jar-probe`: executa o JAR em “integrationMode” para um comando e salva stdout/stderr + exit code (sem gravar segredos).
- `tools/trace-sanitize`: remove tokens/cookies/ids de traces antes de versionar.
- `tools/contract-fixture-gen`: converte traces sanitizadas em fixtures de mocks (ex.: nock) com validação estrita.
- `tools/compat-diff`: roda um harness externo do JAR oficial vs `NodeEngine` e mostra diff estruturado (útil para regressão).

## Milestones (fases até o “final”)
Mesmo indo “direto pro final”, a entrega precisa ser fatiada para convergir com qualidade.

1. **Infra de paridade**
   - Introduzir `SdkEngine` e deixar o CLI selecionável por flag/env.
   - Criar harness de comparação (mesmo comando => diff estruturado).

2. **Core local (sem rede)**
   - Parser de projeto + zip determinístico + deploy.xml semantics.
   - Testes de golden filelist/zip.

3. **Auth CI + SdfClient base**
   - Auth store + provider CI.
   - HTTP client + proxy + retries + logging seguro.

4. **project:deploy / project:validate / project:package**
   - Upload zip + start job + polling + parsing de erros + download logs.

5. **file:***
   - list/upload/import (mapeando o que é “File Cabinet” vs “project files”).

6. **object:* e project:adddependencies**
   - Object list/import/update.
   - Add dependencies (resolução + escrita em manifest).

7. **account:manageauth + account:setup interativo**
   - Manage auth ids.
   - Setup interativo (browser/device-code/callback).

8. **Remoção total do Java**
   - Remover download do JAR e executor Java do caminho principal.
   - Manter apenas tooling de compat (opcional e fora do build final) durante transição.

### Cronograma (estimativa grosseira)
Isso depende muito de como é o protocolo do SDF na prática e do quão “ninja” ele é. Como referência:
- Fases 1–2: 1–2 semanas (infra + packaging sólido)
- Fases 3–4: 2–4 semanas (auth + deploy/validate com polling/logs)
- Fases 5–7: 2–4 semanas (file/object + setup interativo)
- Fase 8: ~1 semana (limpeza, docs, release)

## Testes e segurança
- Unit tests: parsing XML, file matching, zip determinístico, normalização de erros.
- Contract tests: fixtures de request/response (sanitizadas) com mocks estritos.
- Integration tests (marcados slow): opcional, só com env vars explícitas para sandbox.
- Redação de logs: nunca imprimir token, cookies, Authorization headers, etc.

## Critérios de “done”
- `suitecloud` executa comandos principais sem `java` instalado.
- Paridade de comportamento (saída/erros) dentro de tolerância definida.
- Documentação de instalação/uso e runbooks em `.sangoi/runbooks/`.
