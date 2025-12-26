# `.sangoi/.tools/` — AGENTS

Purpose: scripts auxiliares para engenharia reversa e validação (não fazem parte do runtime do CLI).

Key tools:
- `node .sangoi/.tools/jar-inspect.mjs`: extrai endpoints/strings úteis do JAR oficial (sem copiar código).
- `node .sangoi/.tools/jar-class-strings.mjs`: extrai strings do constant pool de `.class` dentro do JAR (UTF-8 constants).
- `node .sangoi/.tools/jar-list-paths.mjs`: lista paths `/app/...` `/rest/...` `/services/...` encontrados no JAR (texto + constant pool).

Notes:
- Estas ferramentas aceitam path do JAR via env/args e só geram output textual/JSON sanitizado.
- Não versionar o JAR no repo.

Last review: 2025-12-19
