# Regras permanentes do projeto

- Este é um sistema React + TypeScript + Fluent UI.
- Código técnico em inglês; UI em português.
- Reutilize o design system existente.
- Não redesenhe telas já aprovadas sem solicitação explícita.
- Os dados atuais vêm do Supabase pela arquitetura: `Component → Service → Repository → Supabase`.
- Nenhum componente deve importar seeds ou acessar o Supabase diretamente.
- Não duplique entidades já existentes.
- Relacione entidades sempre por IDs.
- Contadores e dados enriquecidos são derivados, nunca armazenados nas entidades.
- Não implemente Supabase, PostgreSQL ou backend até solicitação explícita.
- Preserve a integridade referencial.
- Antes de concluir alterações de código, execute `npm run build` e valide a integridade relacional no Supabase quando a alteração envolver dados.
- Não execute regressão completa ou automação de navegador em todas as tarefas; faça isso apenas quando o prompt atual solicitar.
- Não gere screenshots automaticamente, salvo solicitação.
- Não modifique módulos fora do escopo sem necessidade técnica.
- Nunca coloque secrets, senhas ou credenciais no frontend ou nos seeds.
- O projeto usa Git; não reescreva commits anteriores.

## Referências

- `src/data/mock/`: código legado sem uso funcional; não remover sem solicitação explícita.
- `src/services/`: regras de aplicação e acesso aos dados.
- `src/types/`: entidades, contratos e view models.
- `src/components/`: componentes reutilizáveis da interface.
- `src/pages/`: composição das telas e fluxos.
