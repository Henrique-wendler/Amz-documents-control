# Validação do catálogo BASA Ambiental — etapa 3.3

Este relatório usa apenas contagens e descrições técnicas. Nomes de clientes, caminhos de fontes reais, documentos, matrículas reais e hashes identificadores não são mantidos no relatório. O conteúdo identificável da versão anterior foi substituído; o histórico Git não foi reescrito.

## Testes e build

- Checkpoint inicial: `ac3fe49`, árvore limpa e 172 testes aprovados antes das alterações.
- Validação final: **199 testes aprovados**, incluindo 27 novos casos. Os três casos anteriores de bloqueio por múltiplos titulares foram preservados como cenários, com expectativas atualizadas para a importação autorizada nesta etapa.
- `npm run build` concluído. Permanece somente o aviso preexistente de bundle acima de 500 kB.
- Cobertura inclui deduplicação conservadora, relações por matrícula, busca sem resultados duplicados, documentos mascarados, migração legada idempotente, preservação de complemento local, chaves estrangeiras e reversão transacional em falhas.
- Testes executados com o ambiente virtual do desktop, `-p no:cacheprovider` e diretório temporário próprio. Não houve screenshots ou automação de navegador.
- `git diff --check` sem erros. O único Excel rastreado continua sendo o template técnico já existente.

## Modelo e migração

- `PropertyOwner`: ID, nome e documento textual.
- `ParcelOwner`: vínculo por IDs entre matrícula e titular, preservando as grafias encontradas na associação.
- A mesma pessoa identificada por documento normalizável pode participar de várias matrículas. Cada matrícula pode possuir vários titulares. Sem documento, nomes iguais em ocorrências independentes não autorizam deduplicação.
- Uma célula de proprietário explicitamente mesclada pode representar uma ocorrência compartilhada; não há preenchimento genérico por proximidade.
- Contagens e o conjunto de titulares da fazenda são derivados das relações. Campos agregados antigos existem apenas por compatibilidade e não escolhem um proprietário principal.
- Migração SQLite aditiva, versionada, transacional e idempotente. Acrescenta tabelas de titulares e associações, chaves estrangeiras, unicidade dos vínculos e a indicação de normalização.
- O catálogo antigo e seu complemento local são preservados. Relações não são inferidas do proprietário agregado legado: a assinatura da fonte é invalidada uma vez para reconstrução pela releitura. Fontes indisponíveis continuam pesquisáveis no modo legado.
- A migração não abre, apaga ou modifica o banco de propostas.

## Verificação exploratória somente de leitura

| Fonte anonimizada | Fazendas | Matrículas | Titulares distintos | Relações | Status | Avisos | Erros |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| A | 3 | 10 | 1 | 10 | OK | 0 | 0 |
| B | 3 | 9 | 1 | 9 | OK | 0 | 0 |
| C | 4 | 13 | 9 | 41 | OK | 4 | 0 |

As três leituras foram importadas em SQLite somente em memória. As verificações de chave estrangeira e integridade passaram. A busca por cada titular encontrou a fazenda correspondente.

As duas fontes anteriormente válidas mantiveram os IDs de fazenda e parcela, agrupamentos, matrículas e áreas em comparação ao parser do checkpoint. Na terceira fonte, as linhas complementares sob mesclagens de matrícula agora produzem relações com titulares, sem parcelas adicionais.

Os quatro avisos restantes correspondem a conteúdo fora das colunas reconhecidas da tabela; não criam entidades. Não há interpretação jurídica das relações ou das cores da planilha.

SHA-256 calculado antes e depois de cada leitura: igualdade confirmada para os três arquivos. Nenhuma fonte foi salva novamente, copiada para fixtures ou incluída no Git.

## Escopo

A busca continua exibindo fazendas. Para um titular mostra nome abreviado; para vários, mostra a quantidade. Os detalhes exibem os titulares por matrícula e mascaram documentos. Não há tela de gestão de proprietários.

O frontend React, exportadores XLSX/PDF, template técnico, contratos de snapshot e `PropertyLocalEnrichment` foram preservados. Não foram criados backend, integração Google Drive API ou regras bancárias. As regras de exportação de múltiplas matrículas e demais decisões de produto permanecem pendentes.

## Arquivos desta etapa

- `src/amazon_agro/domain/models.py`
- `src/amazon_agro/domain/owner_identity.py`
- `src/amazon_agro/database/catalog_migrations.py`
- `src/amazon_agro/integrations/workbook_parser.py`
- `src/amazon_agro/repositories/sqlite_property_catalog.py`
- `src/amazon_agro/ui/property_selection.py`
- `tests/test_basa_parser_robustness.py`
- `tests/test_property_owners.py`
- `README.md`
- `BASA_PARSER_VALIDATION.md`
