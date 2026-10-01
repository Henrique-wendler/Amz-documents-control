# Validação do parser BASA Ambiental

Data: 01/10/2026. Checkpoint anterior: `d5d7640` (árvore de trabalho limpa antes das alterações).

## Verificações

- Antes das alterações: **92 testes aprovados** e `npm run build` concluído.
- Depois das alterações: **172 testes aprovados**, incluindo os testes existentes de XLSX/PDF, snapshots e `PropertyLocalEnrichment`; `npm run build` concluído.
- Aviso do build, presente antes e depois: bundle JavaScript acima de 500 kB (1.355,75 kB minificado). Nenhuma correção fora do escopo foi aplicada.
- Testes executados com o Python de `desktop/.venv`, `-p no:cacheprovider` e `--basetemp` em `.tmp/basa-validation`, pois o cache antigo e a pasta temporária padrão apresentaram acesso negado. Dependências do frontend restauradas com `npm ci`; lockfile preservado.
- Importações exploratórias de Hélio e Vinicius em SQLite temporário: `PRAGMA foreign_key_check` sem ocorrências e `PRAGMA integrity_check = ok`. O catálogo real do aplicativo não foi modificado. Esta etapa não usa Supabase e não altera dados ou esquema remoto.
- Comparação do parser anterior com o atual no arquivo já válido de Hélio: mesmos 3 IDs de fazenda, 10 IDs de parcela, matrículas e áreas.
- `git diff --check` sem erros. O único Excel rastreado pelo Git continua sendo o template técnico preexistente `desktop/src/amazon_agro/templates/modelo_proposta.xlsx`.

## Resultados separados

Fontes lidas diretamente de Downloads, sem copiar, salvar novamente ou alterar os arquivos.

| Arquivo | Perfil | Fazendas identificadas | Matrículas identificadas | Proprietários identificados | Status | Warnings | Diagnósticos bloqueantes |
| --- | --- | ---: | ---: | ---: | --- | ---: | ---: |
| Basa ambiental - Helio Garcia.xlsx | BASA Ambiental | 3 | 10 | 1 | OK | 0 | 0 |
| Basa ambiental - Vinicius Brito Fagundes.xlsx | BASA Ambiental | 3 | 9 | 1 | OK | 0 | 0 |
| Basa ambiental - Silvio Goulart.xlsx | BASA Ambiental | 4 | 13 | 9 | NEEDS_CONFIGURATION | 4 | 11 |

Hélio e Vinicius foram importados integralmente nos bancos temporários. Para Silvio, os números são contagens definitivas da estrutura física lida, **não registros importados**: nenhuma importação parcial foi realizada. O layout indica 10, 9 e 41 vínculos proprietário–matrícula, respectivamente. Esses vínculos refletem o conteúdo da tabela, sem avaliação jurídica de titularidade.

## Conversão de área e Vinicius

`parse_area_ha` retorna `Decimal` para números Excel e textos válidos. Remove espaços, aceita o sufixo `ha` ou `há` sem distinguir maiúsculas e reconhece ponto ou vírgula decimal. Números de ponto flutuante recebidos do leitor Excel passam por sua representação decimal textual, nunca por `Decimal(float)`.

`None`, string vazia e somente espaços retornam `None`, sem substituir ausência por zero. Um ponto isolado é decimal; milhares brasileiros exigem agrupamento completo e vírgula decimal (`1.234,5678`). Texto arbitrário, unidades diferentes, agrupamentos malformados, negativos e valores não finitos geram diagnóstico sem repetir o conteúdo sensível da célula.

Vinicius é importável porque as nove áreas textuais são números válidos, as mesclagens de matrícula representam parcelas únicas e as mesclagens de fazenda determinam os três grupos. As linhas de continuação não criam parcelas extras. CCIR/ITR que variam entre parcelas ficam preservados nos `extra_fields` da parcela; somente valores comuns a todas as parcelas aparecem também na fazenda. Nenhuma conversão válida de área gera warning.

## Interpretação exata de Silvio

O exame físico corrige a análise exploratória anterior de 6 fazendas e 5 proprietários. Há quatro grupos na coluna B, 13 matrículas na coluna C e nove pares distintos de proprietário/documento nas colunas E/F. Não foram usados nomes de arquivos, cores ou proximidade entre células como regra de associação.

| Região de Fazenda | Matrículas | Interpretação |
| --- | ---: | --- |
| B8:B35 | 7 | Sete mesclagens de matrícula, cada uma com quatro linhas de proprietário. As 21 linhas sem valor direto em C são complementos das matrículas mescladas. |
| B36:B43 | 2 | Duas mesclagens de matrícula com quatro proprietários cada; seis linhas de complemento. |
| B44:B46 | 3 | Três matrículas diretas, uma por linha, com proprietários diferentes dentro da mesma fazenda mesclada. |
| B47:B48 | 1 | Uma matrícula mesclada com dois proprietários; uma linha de complemento. |

Assim, as **28 linhas adicionais são 21 + 6 + 1 complementos de proprietário**, não 28 parcelas vazias. Áreas e documentos rurais mesclados acompanham suas respectivas matrículas. As quatro células da coluna J ficam fora das colunas reconhecidas do cadastro.

O agrupamento Fazenda → Matrícula é determinístico. A limitação restante é de representação: o domínio atual possui `owner_name`/`owner_document` em `RuralProperty`, sem entidade ou relacionamento para vários proprietários. Não há como preservar os 41 vínculos nesse contrato escolhendo apenas um proprietário por fazenda. Por isso o parser bloqueia a importação sem descartar pessoas nem dividir uma fazenda real para obter status OK.

A decisão humana necessária é autorizar e definir, em outra etapa, como o gerador deverá representar os múltiplos titulares informados. Uma simples troca de perfil não resolve essa limitação. Nenhuma lógica nova de copropriedade, entidade ou tela foi criada nesta etapa.

### Todos os diagnósticos bloqueantes de Silvio

| Linhas | Diagnóstico |
| --- | --- |
| 8–11 | Quatro proprietários associados à mesma matrícula por mesclagem. |
| 12–15 | Quatro proprietários associados à mesma matrícula por mesclagem. |
| 16–19 | Quatro proprietários associados à mesma matrícula por mesclagem. |
| 20–23 | Quatro proprietários associados à mesma matrícula por mesclagem. |
| 24–27 | Quatro proprietários associados à mesma matrícula por mesclagem. |
| 28–31 | Quatro proprietários associados à mesma matrícula por mesclagem. |
| 32–35 | Quatro proprietários associados à mesma matrícula por mesclagem. |
| 36–39 | Quatro proprietários associados à mesma matrícula por mesclagem. |
| 40–43 | Quatro proprietários associados à mesma matrícula por mesclagem. |
| 44–46 | Proprietários distintos nas matrículas do mesmo grupo físico de fazenda. |
| 47–48 | Dois proprietários associados à mesma matrícula por mesclagem. |

Todos informam a limitação de um proprietário por fazenda, sem imprimir nomes ou CPF/CNPJ e sem selecionar ou descartar titulares automaticamente.

### Todos os warnings dos arquivos reais

Hélio: nenhum. Vinicius: nenhum. Silvio:

1. Linha 10: conteúdo fora das colunas da tabela ignorado (J10).
2. Linha 31: conteúdo fora das colunas da tabela ignorado (J31).
3. Linha 33: conteúdo fora das colunas da tabela ignorado (J33).
4. Linha 34: conteúdo fora das colunas da tabela ignorado (J34).

## SHA-256 antes e depois

| Arquivo | SHA-256 antes | SHA-256 depois |
| --- | --- | --- |
| Hélio | `525bbd5e0dde87ded87298700749f048c2b74a484753351c6463cf7dd556b5a3` | `525bbd5e0dde87ded87298700749f048c2b74a484753351c6463cf7dd556b5a3` |
| Vinicius | `fd0b0cae6554c096bb903abd0b45a952a7d0f35cfdbdf76fd98206a0850465e2` | `fd0b0cae6554c096bb903abd0b45a952a7d0f35cfdbdf76fd98206a0850465e2` |
| Silvio | `351c3fe9cfdfbd8446ea46b596e491c88cc11160b0bd7e769c6041a8e101334c` | `351c3fe9cfdfbd8446ea46b596e491c88cc11160b0bd7e769c6041a8e101334c` |

## Arquivos alterados ou adicionados

- `desktop/src/amazon_agro/integrations/area_parser.py`: conversão isolada de hectares.
- `desktop/src/amazon_agro/integrations/workbook_parser.py`: interpretação de mesclagens, complementos, campos opcionais e diagnósticos.
- `desktop/src/amazon_agro/integrations/workbook_profile.py`: Fazenda/Matrícula como campos estruturais obrigatórios do perfil padrão.
- `desktop/src/amazon_agro/integrations/workbook_inspector.py`: diagnósticos agregados e proteção dos campos estruturais obrigatórios.
- `desktop/src/amazon_agro/repositories/sqlite_property_catalog.py`: preservação dos warnings e indexação dos documentos de parcela já armazenados em `extra_fields`.
- `desktop/src/amazon_agro/services/property_sync_service.py`: versão do parser na assinatura que determina o reprocessamento.
- `desktop/tests/test_area_parser.py`: testes unitários de conversão e rejeição.
- `desktop/tests/test_basa_parser_robustness.py`: layouts sintéticos, ambiguidade, complementos, documentos por parcela, warnings, cores e atomicidade.
- `desktop/tests/test_property_workbooks.py`: adequação de três expectativas antigas ao caráter opcional do proprietário.
- `desktop/README.md`: documentação das regras.
- `desktop/BASA_PARSER_VALIDATION.md`: este relatório.

## Escopo preservado

Exportadores XLSX/PDF, snapshots, `PropertyLocalEnrichment`, frontend React, modelos de domínio, telas e template técnico permanecem sem alterações. Nenhuma inferência de município/UF foi acrescentada. Não foram implementados backend, Supabase, administração cadastral, copropriedade ou novas funcionalidades fora do gerador de propostas. As demais decisões de negócio listadas no pedido continuam pendentes.

Nenhum Excel real foi incluído no Git, copiado para fixtures ou alterado. Os testes geram apenas workbooks sintéticos com dados fictícios. `Demandas - Amazon Agro.xlsx` não foi aberto nem processado. A verificação exploratória utilizou bancos temporários em diretório ignorado pelo Git.
