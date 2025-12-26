# Task log — Embedded JRE para SuiteCloud CLI (Linux/WSL)

Data: 2025-12-19

Status: **revertido** (fork agora é java-free; JAR/JRE removidos)

## Contexto / problema
O `packages/node-cli` é um wrapper Node que baixa um JAR e executa `java -jar ...`. Em ambientes tipo WSL (e neste sandbox), `java` não está disponível, então não dá pra rodar `project:deploy` etc.

## Decisões
- Inicialmente, a solução prática foi **não exigir Java instalado no sistema**: instalar um JRE embutido quando necessário.
- Depois, a direção do fork mudou para **obliterar Java/JAR**; a implementação de JRE embutido e download do JAR foi removida.
- O `SUITECLOUD_SDK_HOME` permaneceu (é útil para guardar estado/config do SDK Node).

## Implementação (resumo)
- (Removida) instalação de JRE embutido + execução do JAR Oracle.
- (Atual) engine Node-only; sem dependência de Java.

## Comandos/validação executados
- Histórico (quando ainda existia JRE embutido): instalação + testes.

## Riscos conhecidos
- N/A (feature removida).
