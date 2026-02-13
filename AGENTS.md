# AGENTS.md

## Objetivo do Projeto
Aplicação Next.js + Supabase para gestão financeira de clínica, com foco em estabilidade operacional, segurança de dados e evolução contínua.

## Agentes Recomendados

### 1) Setup Agent
Use para configuração inicial e ajustes de ambiente.

Responsabilidades:
- Validar `.env.local` e conectividade com Supabase.
- Validar scripts de execução (`dev`, `build`, `lint`).
- Confirmar pré-requisitos de deploy (Vercel + variáveis).

Skills a usar:
- `supabase-specialist`
- `nextjs-supabase-auth`
- `postgres-best-practices`
- `vercel-deploy`
- `doc`

### 2) Optimization Agent
Use para melhorar performance, DX e qualidade de implementação.

Responsabilidades:
- Revisar gargalos no App Router e hooks de dados.
- Propor melhorias de cache/fetching e renderização.
- Sugerir simplificações de código e componentes.

Skills a usar:
- `frontend-nextjs`
- `nextjs-app-router-patterns`
- `nextjs-best-practices`
- `frontend-dev-guidelines`
- `tailwind-patterns`
- `radix-ui-design-system`
- `financial-calculations`
- `playwright` (validação de fluxos críticos)
- `e2e-testing-patterns`
- `gh-fix-ci` (quando otimização exigir ajustes de pipeline)

### 3) Maintenance Agent
Use para rotina contínua de manutenção e redução de risco.

Responsabilidades:
- Atualização e saúde de CI.
- Revisão de segurança e dependências.
- Observabilidade e resposta a incidentes.

Skills a usar:
- `supabase-specialist`
- `postgresql`
- `postgres-best-practices`
- `lint-and-validate`
- `financial-calculations`
- `security-best-practices`
- `security-threat-model`
- `security-ownership-map`
- `sentry`
- `gh-address-comments`
- `gh-fix-ci`

## Regras de Acionamento de Skills
- Se a tarefa envolver deploy: acionar `vercel-deploy`.
- Se envolver schema, RLS, Auth, SQL e integrações DB: acionar `supabase-specialist`.
- Se envolver autenticação Supabase no App Router: acionar `nextjs-supabase-auth`.
- Se envolver fórmulas, taxas, repasses, bônus e arredondamento: acionar `financial-calculations`.
- Se envolver UI/UX, App Router, componentes e performance de renderização: acionar `frontend-nextjs`.
- Se envolver refinamento de arquitetura Next.js: acionar `nextjs-app-router-patterns` e/ou `nextjs-best-practices`.
- Se envolver design system/UI com shadcn-Radix-Tailwind: acionar `radix-ui-design-system` e `tailwind-patterns`.
- Se envolver estabilidade de PR/CI: acionar `gh-fix-ci` e `gh-address-comments`.
- Se envolver risco, credenciais, RLS ou acesso a dados: acionar `security-*`.
- Se envolver monitoramento de erro em produção: acionar `sentry`.
- Se envolver fluxo de interface crítico: acionar `playwright`.

## Contexto de Domínio
- Regras financeiras e de repasse estão em `src/lib/calculations.ts`.
- Integração Supabase está em `src/lib/supabase/`.
- Fluxos críticos de UI: `src/app/atendimentos/`, `src/app/repasses/`, `src/app/despesas/`, `src/app/configuracoes/`.

## Critérios Mínimos por Entrega
- `npm run lint` sem erros.
- Fluxo principal validado (manual ou `playwright`).
- Mudanças com impacto em dados revisadas com checklist de segurança.
