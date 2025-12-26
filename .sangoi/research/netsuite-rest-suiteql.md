# Research — NetSuite REST Query Service (SuiteQL)

Data: 2025-12-19

Motivo: implementar `file:list` e outras operações de leitura sem depender de endpoints internos do SDF/JAR.

## Endpoint
- REST Query Service: `POST /services/rest/query/v1/suiteql`
- Paginação via query params: `?limit=<n>&offset=<n>`

## Headers comuns
- `Authorization: Bearer <access_token>`
- `Content-Type: application/json`
- `Prefer: transient` (recomendado na documentação para chamadas de query)

## Body
```json
{ "q": "SELECT ..." }
```

## Response (alto nível)
- `items`: array com as linhas retornadas
- `hasMore`: boolean indicando se há mais páginas

## Observações para o fork
- Preferir SuiteQL para listagens (ex.: `folder`/`file`) quando possível: reduz acoplamento com handlers `*.nl` do SDF.
- Continuar usando OAuth2 client_credentials para obter token válido antes das queries.

