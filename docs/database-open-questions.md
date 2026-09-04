# Questões de negócio abertas

## Decisões fechadas para a V1

- A arquitetura é multi-tenant-ready, mas começa com uma organização.
- Cada profile pertence obrigatoriamente a exatamente uma organização; usuário multi-organização está fora da V1.
- Unicidades de negócio são delimitadas por `organization_id`.
- `ownership_links.percentage` pode ser `NULL`; percentuais ativos informados devem somar no máximo 100%, sem obrigação de chegar a 100%.
- `issue_date` e `expiration_date` usam `date`; timestamps de sistema usam `timestamptz`.
- `total_area`, `reserve_area` e `consolidated_area` exigem apenas valores maiores ou iguais a zero. Nenhuma regra jurídica adicional entre essas áreas será criada por enquanto.
- A organização inicial e o primeiro Admin são provisionados em ambiente administrativo seguro; não existe cadastro público.

## Campos pendentes

1. **CAB:** qual é o significado, entidade proprietária, formato, obrigatoriedade, unicidade e ciclo de vida? Deve ter catálogo, histórico ou vínculo com documento?
2. **HP:** qual é o significado na matrícula, formato, regras, obrigatoriedade e impacto em filtros/relatórios? É atributo, relação ou classificação?

## Organização e identidade

3. Quais requisitos de MFA, recuperação de conta, aprovação e revogação serão obrigatórios para Admins e demais perfis?

## Imóveis e titularidade

4. Pode existir mais de um vínculo ativo do mesmo proprietário com a mesma matrícula, ou deve haver uma unicidade condicional?

## Operações e garantias

5. Toda operação deve ter ao menos uma matrícula e exatamente uma principal antes de ficar ativa?
6. Toda garantia deve ter ao menos um tipo, uma matrícula e um tipo principal antes de ficar ativa?
7. Instituições financeiras e tipos de garantia permanecerão catálogos por organização ou poderão ser administrados globalmente em versão futura?
8. Quais transições de status são permitidas e quais são irreversíveis após `completed`, `closed` ou `cancelled`?

## Documentos, CAR e arquivos

9. Quais tipos documentais exigem validade e deve haver validação obrigatória de `expiration_date` quando `requires_expiration = true`?
10. Qual fuso civil deve reger `current_date` para validade documental e qual política vale na virada do dia?
11. Número de documento precisa de unicidade por organização, tipo, fazenda e/ou exercício?
12. O proprietário declarado no CAR permanece texto histórico ou haverá também vínculo opcional com `owners`?
13. As Fases A/B/C definiram object keys e caminhos locais por UUID, bucket privado, limite padrão de 20 MB, MIME configurável, SHA-256 verificado, cópia Cloud → `network_share` e disponibilização local → Cloud sob demanda por Gateway outbound-only. Permanecem pendentes retenção, antivírus, reconciliação operacional, implantação no compartilhamento real e política para migração seletiva de legados.

## Governança e operação

14. Quais prazos de retenção valem para soft deleted, `audit_log`, `file_access_log` e `report_log`? Haverá purge físico aprovado ou legal hold?
15. Quem pode restaurar registros e quais aprovações serão exigidas além da permission técnica?
16. O JSON de templates terá schema/versionamento formal e quem poderá publicá-lo?
17. Quais relatórios serão confidenciais e quais regras de marca d'água, paginação e arquivamento serão obrigatórias?
18. Quais RPO/RTO, retenção de backup, região e frequência de teste de restore serão exigidos?
19. Haverá ambiente `staging` e dados sintéticos próprios antes de produção?
