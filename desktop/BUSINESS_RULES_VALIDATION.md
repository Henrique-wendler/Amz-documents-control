# Definições de negócio aprovadas — validação

Validação em 05/10/2026. Baseline de regressão preservado:
`b1411b1883292f1bcedc3378cf2406b8bf344940`.

O Setup baseline `AmazonAgroPropostas-Setup-0.1.0-unsigned-rc.exe` não foi
reconstruído nem alterado. Seu SHA-256 permanece
`D41C543EFFF22C9ABF0BE924FB45F3E572AA2DC43177D4F05CED40D06F79512E`.
As mudanças desta etapa estão no código e ainda não fazem parte desse Setup.
Não houve novo commit, push, instalação ou mudança de assinatura digital.

## Resultados

- **290 testes aprovados**, sem falhas ou skips nesta máquina: os 264 casos
  existentes foram mantidos, com expectativas antigas de bloqueio/default
  atualizadas para as regras aprovadas, e 26 casos foram adicionados.
- `npm run build`: PASS.
- `git diff --check`: PASS.
- Testes de PDF nativo: cinco conversões reais com **Excel COM**, conferidas
  com `pypdf`; o texto de cada matrícula foi encontrado na página esperada.
- Conferência visual das três páginas do caso com nove matrículas: cabeçalhos,
  fontes, alinhamentos e bordas compatíveis com o modelo; sem corte de matrículas.
- Smoke do **código fonte**: `ok=true`, `frozen=false`, `save_reopen_ok=true`,
  `xlsx_ok=true`, `pdf_ok=true`, backend `Excel COM`,
  `new_excel_processes_remaining=[]`, `template_unchanged=true`,
  `sqlite_integrity=ok`. Esse smoke não representa QA instalado de uma nova RC.

| Matrículas selecionadas | Páginas de impressão XLSX | Páginas PDF Excel COM |
|---|---|---|
| 1 | 1 | 1 |
| 4 | 1 | 1 |
| 5 | 2 | 2 |
| 8 | 2 | 2 |
| 9 | 3 | 3 |

Também há regressão estrutural para 13 matrículas, com quatro páginas XLSX.
As evidências e arquivos fictícios ficam exclusivamente em `.build-work/`,
ignorado pelo Git. A execução final da suíte está em
`.build-work/business-verified-f18aac53989e4600bcad052efd85d012/tests.xml`.
O smoke fonte está em
`.build-work/business-final-416ea1dfa50c416f8731ffebd820cf3b/source-smoke/report.json`.

## Matrículas, classificação e snapshot

`ProposalPropertyParcel` registra `parcel_external_id`,
`registration_snapshot`, `classificacao`, matrícula anterior, área e lote.
Cada matrícula selecionada tem sua própria classificação. O vínculo da fazenda
mantém `ProposalProperty.classificacao` somente para compatibilidade legada;
a exportação de snapshots usa a classificação individual.

A seleção de uma fazenda começa sem matrículas marcadas. O usuário marca as
desejadas e pode definir classificações diferentes; escolher apenas duas de seis
foi validado. O comando **Selecionar / classificar** permite rever a seleção,
inclusive com o catálogo indisponível, usando os valores históricos já salvos.
Reabrir a proposta preserva a seleção e a classificação de cada parcela.
Mudanças no catálogo ou na classificação da fazenda não reclassificam o snapshot.

Código **1 = Hipoteca** na interface e na exportação. Configurações antigas que
usavam garantia/ambiguidade recebem o rótulo oficial; os demais códigos e seus
rótulos configurados são preservados. O template original não foi modificado.

## Continuação XLSX/PDF

Uma linha por matrícula, quatro linhas por página, sem limite total de quatro
imóveis e sem truncamento. A primeira página mantém o modelo original. As
continuações repetem identidade da proposta e proponente, cabeçalho dos imóveis,
legenda, técnico e data. Células, mesclas, fontes, bordas, alinhamentos e alturas
são copiados do modelo; as larguras e margens permanecem as mesmas.

Cada bloco tem sua área de impressão e quebra explícita, no mesmo worksheet.
Para várias páginas, `fitToHeight=0` preserva a altura livre e
`fitToWidth=1` mantém a largura. O conversor PDF preserva todas as áreas e não
restringe o documento novamente a `A1:M35`.

## Amazon Agro e validação comum

A Amazon Agro é incluída somente na criação de uma nova proposta. Nome e
documento padrão usam `default_consultancy_name` e `default_consultancy_document`.
O nome inicial segue a referência existente e o CNPJ fica vazio, sem inventar
dados cadastrais.

Conforme a resposta do usuário, **o tipo fica para escolha na interface**:
`Participant.tipo=None` no rascunho, com indicação de tipo provisório. Não foi
criado um código padrão. Para salvar/exportar, o usuário escolhe um tipo válido
ou remove o participante. Nome, documento e tipo podem ser editados, e o
participante pode ser substituído ou removido. Reabrir uma proposta não o reinclui.

Todos os bancos usam o mesmo `ProposalExportValidator`, com as obrigatoriedades
comuns já existentes. Recursos Próprios no documento continuam somente Sim/Não
em `G21` e percentual em `H21`; o valor monetário legado não é exportado.

## Migração e preservação

Ao abrir um banco antigo sem classificação individual, o repositório adiciona
`proposal_property_parcels.classificacao` e copia uma única vez o código do
vínculo da fazenda para suas parcelas. Não apaga propostas ou matrículas, nem
sobrescreve classificações individuais existentes. A operação é idempotente.

A transação SQLite inclui as alterações de esquema e dados, inclusive quando o
driver usa o controle transacional legado. Uma falha sintética durante a migração
confirmou rollback do esquema e preservação da proposta e matrícula; removida a
falha, a reabertura/migração foi aprovada. Integridade e chaves estrangeiras foram
verificadas nos bancos fictícios.

Propostas anteriores aos snapshots continuam abrindo; dados nunca salvos ainda
dependem da fonte original, conforme a compatibilidade já existente. Não se
inventam dados de fontes perdidas. Parser BASA, Google Drive, `PropertyOwner`,
onboarding, recursos do instalador e assinatura não foram alterados. O driver
de smoke foi ajustado somente para escolher explicitamente o tipo do participante
fictício e acompanhar o controle de classificação por matrícula.

## Pendências

- Dados cadastrais oficiais da Amazon Agro; nenhum código/tipo padrão foi aprovado.
- Identidade das fontes após renomeações/movimentações extremas e interpretação
  de estruturas BASA não descritas pelo perfil atual permanecem fora desta etapa.
- Fonte oficial de município/UF quando ausente; permanece o complemento local.

As pendências de múltiplas matrículas, limite de quatro linhas, rótulo do código 1,
inclusão inicial da Amazon Agro e regras comuns dos bancos estão resolvidas pelas
definições desta etapa. Os relatórios anteriores registram o estado histórico.

## Arquivos alterados (25, caminhos relativos a `desktop/`)

- `README.md`
- `BUSINESS_RULES_VALIDATION.md`
- `config.example.json`
- `src/amazon_agro/app/smoke.py`
- `src/amazon_agro/config/settings.py`
- `src/amazon_agro/domain/models.py`
- `src/amazon_agro/exporters/excel.py`
- `src/amazon_agro/exporters/excel_pagination.py`
- `src/amazon_agro/exporters/pdf.py`
- `src/amazon_agro/repositories/sqlite_proposals.py`
- `src/amazon_agro/services/export_validator.py`
- `src/amazon_agro/services/proposal_service.py`
- `src/amazon_agro/ui/main_window.py`
- `src/amazon_agro/ui/pages.py`
- `src/amazon_agro/ui/property_selection.py`
- `src/amazon_agro/ui/review.py`
- `src/amazon_agro/ui/summary.py`
- `tests/test_business_definitions.py`
- `tests/test_excel_export.py`
- `tests/test_export_validation.py`
- `tests/test_property_local_enrichment.py`
- `tests/test_property_owners.py`
- `tests/test_property_snapshots.py`
- `tests/test_property_ui.py`
- `tests/test_proposal_ui.py`
