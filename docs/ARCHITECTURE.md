# ARCHITECTURE.md — mapa transversal região→feature

> Orçamento-alvo: ≤4.800 bytes. Nível 0.5 de leitura: responde "este trecho do código pertence a qual feature?".
> Cobre TODO o código, inclusive o que ainda não tem feature (marque `(sem feature)`).
> Atualize quando uma SPEC mover fronteiras. Detalhe fino vive em `docs/features/<area>.md`.

## Mapa região → feature

| Região (path) | Feature (TAXONOMY) | Nota (1 linha) |
|---|---|---|

<!-- Exemplos — remova ao preencher:
| src/server/auth/ | api/auth | JWT + refresh; middleware em src/server/middleware/ |
| src/web/checkout/ | web/checkout | SPA; consome api/orders |
| scripts/ | (sem feature) | utilitários de build — ainda sem dono |
-->

## Fluxos transversais

<!-- 1-3 linhas por fluxo que cruza regiões. Exemplos — remova ao preencher:
- Compra: web/checkout → api/orders → api/payments (webhook assíncrono)
- Deploy: infra/ci → build → registry → produção
-->
