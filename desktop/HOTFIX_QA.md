# Hotfix após QA manual — Amazon Agro Propostas

Data: 06/10/2026. Código de partida: `a69d4b2bacc9874d200219fa3fd9a605d74fa596`.
O baseline de regressão `b1411b1883292f1bcedc3378cf2406b8bf344940` permanece preservado.

## Decisão de negócio vigente

- Nome: **Amazon Agro Consultoria e Projetos LTDA**.
- CNPJ: **07.778.284/0001-90**, exibido e persistido como texto, compatível com o domínio atual.
- Tipo padrão: **1 — Emitente principal**, confirmado oficialmente pelo responsável.
- A nova proposta adiciona o participante automaticamente. Tipo, nome e documento continuam editáveis; o participante pode ser removido ou substituído.
- A configuração antiga da Amazon Agro com documento vazio passa a usar o CNPJ oficial para novas propostas. Participantes salvos anteriormente não são reescritos nem duplicados ao reabrir.
- O tipo 6 do DOCX e os tipos 4/5 do XLSX não prevalecem sobre a decisão atual.

## Defeitos e correções

| Severidade | Problema do QA | Correção | Validação |
| --- | --- | --- | --- |
| HIGH | Digitar valores a partir do zero exigia apagar o conteúdo | `CurrencyInput` reutilizável, seleção do zero, entrada brasileira, `Decimal`, edição parcial, colagem e roda do mouse sem alterar valor | Eventos reais de teclado/mouse Qt; precisão decimal |
| HIGH | BASA reconhecia o cabeçalho, mas rejeitava blocos da mesma fazenda | Mesclas físicas compartilhadas de CCIR/ITR/CAR conectam somente blocos adjacentes com o mesmo nome | Planilha real, fixture estrutural anônima e testes de ambiguidade |
| HIGH | PDF sem logo e com cortes/desalinhamento | Layout da cópia XLSX adaptado ao DOCX aprovado; logo oficial recortada; bordas, mesclas, fontes, alinhamentos e margens corrigidos | XLSX e conversão Excel COM; inspeção visual dos PDFs |
| HIGH | Laudo ABC sem opções exclusivas e sem valor persistido | Sim/Não exclusivo, percentual e valor explícitos, ocultação/desabilitação no Não, migração SQLite | Persistência/reabertura, banco legado e exportação condicional |
| MEDIUM | Status / Etapa / Banco e Aguardando no fluxo atual | Campos removidos da operação/revisão; valores antigos preservados no domínio/SQLite | Reabertura e gravação de proposta legada |
| MEDIUM | Ordem financeira inadequada | Descrição, Total, FNO/OF com participação calculada, Recursos próprios, percentual, ASTEC FNO, ABC e ASTEC OF | Regressão da composição da tela |
| MEDIUM | CLASS. DA % sem definição e como entrada manual | Definição oficial: participação FNO/OF sobre Total, derivada com Decimal; resultados somente leitura | Fórmulas, centavos, edição em tempo real, persistência e documentos |
| MEDIUM | Percentuais ASTEC FNO/OF expostos/exportados | Somente Sim/Não no fluxo atual; dados antigos não bloqueiam validação e não entram no documento | Regressões de compatibilidade e mapeamento XLSX |
| LOW | Seletor de pastas parecia não encontrar XLSX | Orientação explícita sobre seleção de pasta; lista de nomes, perfil, status, fazendas e diagnóstico visível | Teste da tela antes/depois da atualização |

Durante a inspeção nativa também foram corrigidos o título do número da proposta,
o alinhamento da resposta ASTEC FNO e a apresentação dos percentuais. A coluna
de percentual de recursos próprios foi ampliada para evitar `####`; a regressão
nativa rejeita números ocultos dessa forma no PDF.
Na finalização, as colunas D/E foram ampliadas para manter a palavra
“PARTICIPAÇÃO” inteira, junto à identificação FNO/OF. A célula do número da
proposta usa ajuste de texto à largura para evitar cortar números mais longos.

## Laudo ABC e compatibilidade

O rótulo oficial do documento é **LAUDO ABC FINANCIADO?**.

`laudo_abc_valor` é `Decimal | None` no domínio e texto decimal nullable no SQLite.
A coluna é adicionada transacionalmente a bancos existentes, sem excluir outras
colunas, propostas, participantes, IDs ou snapshots. A regressão abre um banco
sem essa coluna, migra, grava, reabre e verifica integridade/chaves estrangeiras.

**Sim:** mostra percentual e valor, informados independentemente pelo usuário.
Não foi criada fórmula entre esses valores. Ambos sobrevivem à gravação e reabertura.
**Não:** oculta/desabilita os controles e omite percentual e valor no XLSX/PDF,
inclusive quando uma proposta legada ainda contém esses valores.

Percentuais ASTEC legados permanecem no banco para compatibilidade. Status e
Aguardando também permanecem legíveis; nenhum deles participa do documento novo.
A seleção e classificação individual de matrículas, Hipoteca=1, snapshots,
múltiplos proprietários, complemento local município/UF e validação comum dos
bancos continuam cobertos pela suíte anterior.

## CLASS. DA % — decisão oficialmente esclarecida

**CLASS. DA % = participação percentual de FNO e OF sobre o Valor Total.**
A instrução posterior substituiu a remoção inicialmente solicitada. Esta regra
não está mais pendente de decisão de negócio.

```text
FNO_PERCENTUAL = (valor_fno / valor_total) * 100
OF_PERCENTUAL  = (valor_of / valor_total) * 100
```

As operações usam `Decimal`, sem quantização intermediária para duas casas.
O arredondamento de apresentação usa duas casas e `ROUND_HALF_UP`. Total zero
retorna `0,00%` para os dois resultados. Recursos próprios não mudam o denominador;
FNO% + OF% pode ser menor que 100%. Total 2.000.000 / FNO 1.500.000 / OF 500.000
produz `75,00%` e `25,00%`; FNO 1.200.000 / OF 500.000 produz `60,00%` e `25,00%`.

O antigo controle manual não existe mais. A página Proposta mostra resultados
em QLabel junto aos valores FNO/OF, atualizados a cada edição de Total/FNO/OF;
resumo e revisão mostram os mesmos resultados. A verdade financeira permanece
em `valor_total`, `valor_fno` e `valor_of`. Propriedades derivadas não são novas
colunas SQLite. Valores antigos de `classificacao_da_percentual` são preservados
ao abrir/salvar e ignorados no cálculo novo, inclusive quando fora de 0–100.

No documento, D22/D24 identificam **PARTICIPAÇÃO FNO/OF**, D23/D25 contêm números
calculados com formato `0.00%`, ao lado dos valores A23/A25. O template original
não é alterado. O mesmo XLSX continua sendo convertido pelo Excel COM.

FNO ou OF individualmente acima de Total e a soma FNO + OF acima de Total geram
mensagens claras na validação de exportação. A exportação é impedida antes de
criar documentos; a gravação de uma proposta incompleta continua permitida e
não ajusta automaticamente os valores informados.

## Diagnóstico da planilha BASA real

Foi usada a planilha indicada pelo usuário, disponível como cópia local em
Downloads. A fonte foi aberta somente para leitura, sem editar ou copiar o
arquivo real para a árvore versionada. O diagnóstico encontrou:

- Aba `Planilha1`, 44 linhas e 10 colunas.
- Cabeçalho na linha 7, colunas B:J; Área, Município e UF ausentes/opcionais.
- Mesclas de Fazenda e Matrícula em blocos de duas linhas.
- A mesma fazenda aparece em blocos adjacentes separados, enquanto mesclas
  compartilhadas de CCIR/ITR/CAR abrangem várias matrículas.
- O parser anterior gerava “Blocos separados têm a mesma identidade de fazenda”.
  O problema era o agrupamento, não o nome do arquivo ou a identificação do cabeçalho.

Resultado real no catálogo:

| Medida | Resultado |
| --- | --- |
| Arquivos | 1 |
| Perfil / status | BASA Ambiental / OK |
| Fazendas | 9 |
| Matrículas | 12 |
| Proprietários | 4 |
| Avisos | 0 |
| Segunda atualização | UNCHANGED |
| Hash do arquivo antes/depois | Igual |
| SQLite integrity_check | ok |
| Erros de chave estrangeira | 0 |

SHA-256 antes e depois da verificação real desta finalização:
`87BE93D3711DC4080B18561625ECE1CE587D85D35AC52D526869CFDB78AD4B1C`.
Perfil automático, sem atribuição manual. Uma fixture anônima adicional mantém
as contagens 9/12/4 e verifica a disponibilidade dos imóveis na etapa 4 depois
do botão Atualizar catálogo, além da persistência de `source_directory`.

A reprodução anônima em `tests/test_hotfix_qa.py` mantém cabeçalho na linha 7,
B:J, mesclas independentes de nome/matrícula e documentos compartilhados. As
regressões anteriores continuam rejeitando nomes iguais em blocos sem vínculo
estrutural, matrículas/áreas ambíguas e associações indevidas de proprietários.

O parser tem revisão 4 na assinatura de sincronização, reprocessando fontes
afetadas. A detecção BASA considera cabeçalhos/estrutura; atribuição manual e
regras explícitas prevalecem. Erros de leitura orientam disponibilizar o arquivo
off-line no Google Drive for Desktop e atualizar novamente, preservando o último
catálogo válido. A falha de streaming foi simulada com `OSError`; não se declara
teste de desconexão física de uma unidade Drive nesta máquina.

A orientação da tela é: “Selecione a pasta que contém as planilhas. Os arquivos
podem não aparecer nesta janela de seleção.” A descoberta de XLSX/XLSM e a
opção Incluir subpastas estão cobertas nos modos direto e recursivo; temporários
do Excel continuam ignorados. O seletor é de pasta, sem API Google.

## Referência e apresentação XLSX/PDF

O usuário confirmou o uso do **Modelo Proposta.docx** encontrado e autorizou o
recorte da logo incorporada ao modelo/papel timbrado. O DOCX foi convertido pelo
Word COM em modo somente leitura para conferência. A ausência de LibreOffice
no runtime impediu o renderizador DOCX inicial; a conferência usou Word COM e
Poppler. O PDF defeituoso do QA não foi usado como referência de layout.

O recorte PNG contém somente a marca, em 1221×258 pixels, sem redesenho, endereço
ou restante do papel timbrado. Ele é incorporado à página inicial e às continuações.
O ícone do aplicativo/instalador anterior permanece intacto.

O template técnico original permanece inalterado. Só sua cópia em memória é
adaptada: seções I–IV, tabelas, bordas, mesclas, coluna Tipo e legendas associadas,
financiamento organizado e Laudo ABC com percentual/valor identificados. Número
da proposta fica em A3, agência em K3, e os rótulos ficam em A2/K2. A exportação
usa números monetários com formato brasileiro e percentuais com duas casas.
Recursos próprios permanecem Sim/Não e percentual no documento, como aprovado
anteriormente. O PDF é convertido desse mesmo XLSX pelo Excel COM.

Continuações repetem logo, identidade da proposta/proponente, imóveis, legenda,
técnico e data. Cada página tem quatro posições de matrícula e sua classificação
individual. A seção financeira não se repete. Não há página vazia adicional.

| Matrículas | Páginas esperadas | Páginas reais (pypdf) | Visual |
| --- | --- | --- | --- |
| 1 | 1 | 1 | PASS |
| 4 | 1 | 1 | PASS |
| 5 | 2 | 2 | PASS |
| 8 | 2 | 2 | PASS |
| 9 | 3 | 3 | PASS |

Os casos usam dados sintéticos, sete participantes, nomes de fazenda em duas
linhas, financiamento preenchido e Laudo ABC ativo. Os PNGs de todas as páginas
são inspecionados; nenhum dado pessoal de QA entra no Git. As evidências ficam
no diretório ignorado `tmp/hotfix-finalization-20261006/`.

A inspeção final cobriu todas as nove páginas dos cinco casos: logo visível,
textos dentro das margens, participantes e códigos alinhados, financiamento
legível, ABC associado a seus valores e rodapé presente. Não há `####`, cortes
observados ou páginas vazias adicionais. As continuações têm somente identidade
e imóveis; o espaço restante decorre dessa composição, sem repetir financiamento.
As fontes efetivas do corpo são aproximadamente 10 pt; títulos 11 pt e legendas
8,5 pt. A evidência final é `native-layout-shares/pdf-validation.json`.

## Gates finais

| Gate | Resultado |
| --- | --- |
| pytest completo | PASS — 355 testes, 0 falhas, 0 skips, 169,66 s |
| Testes anteriores preservados | 326 casos do baseline do hotfix mantidos/ajustados à definição oficial |
| Testes novos nesta finalização | 29: 11 de finalização/compatibilidade/ABC/Drive e 18 da participação financeira |
| npm run build | PASS — aviso existente de chunk acima de 500 kB |
| git diff --check | PASS |
| Smoke do código fonte | PASS, `ok=true`, `frozen=false` |
| XLSX real / PDF Excel COM | PASS / PASS |
| Template inalterado | PASS |
| Processos Excel novos remanescentes | `[]` no smoke e na conversão dos cinco casos |

Smoke final: `save_reopen_ok=true`, `abc_persistence_ok=true`, `xlsx_ok=true`,
`pdf_ok=true`, `pdf_backends=["Excel COM"]`, `abc_export_ok=true`,
`financing_shares_ok=true`,
`official_logo_ok=true`, `amazon_default_ok=true`, `amazon_default_type=1`,
`template_unchanged=true`, `sqlite_integrity="ok"` e
`new_excel_processes_remaining=[]`. O relatório está em `source-smoke-shares/report.json`.
O smoke passou pela UI real em modo Qt offscreen, sem traceback; configurações,
bancos, logs e documentos sintéticos ficaram em LOCALAPPDATA isolado. Não se
declara validação manual do aplicativo instalado nesta finalização.

A suíte final foi executada com os sete testes opcionais Excel COM habilitados
por `AMAZON_AGRO_PDF_READER_PYTHON`: cinco de paginação e dois de ABC/participação
FNO/OF. São 326 casos do baseline preservados e 29 regressões novas nesta
finalização; 58 adicionais em relação aos 297 do início do hotfix. O JUnit final
está em `pytest-final-approved.xml`, dentro do diretório de evidências ignorado.
Uma execução intermediária passou em 353 casos e identificou dois casos nativos
com quebra da palavra “PARTICIPAÇÃO”; a largura foi corrigida e a suíte completa
foi executada novamente, passando nos 355 casos.

## Artefatos e limites desta etapa

- Não foi gerado instalador, EXE empacotado ou nova RC; nenhum commit/push foi feito.
- A RC anterior permanece com SHA-256
  `899B12B373D49CF1C97A90C9E61FAF20306C847B665A952403A2B91A0365E56A`.
- Nenhuma planilha BASA real, banco real, log, documento de referência completo
  ou dado pessoal foi adicionado ao Git. Bancos e documentos de QA ficam ignorados.
- A dependência Pillow e o recurso da logo foram declarados no pacote/spec;
  a auditoria futura exige a logo e verifica seu hash. Isso não reconstrói a RC atual.
- A fonte continua sendo uma pasta comum sincronizada pelo Google Drive for
  Desktop; não foi criada integração API, OAuth, download HTTP ou sincronização própria.
- A validação instalada do hotfix e o QA externo permanecem para uma próxima etapa.
  Este relatório não declara GO para piloto.

## Bugs abertos

Nenhum defeito restante foi identificado nos cenários solicitados e executados.
Permanecem como verificações externas futuras o aplicativo instalado com o hotfix
e uma desconexão física/reconexão de pasta Drive. O comportamento de leitura
indisponível/cache preservado está coberto por simulação automatizada. Textos
arbitrariamente maiores que os casos validados ainda devem ser conferidos no
QA manual; o relatório não afirma ausência de defeitos para qualquer conteúdo.

## Arquivos alterados

Todos os caminhos abaixo são relativos à raiz do repositório. `M` indica arquivo
existente alterado; `??`, arquivo novo. São 37 arquivos (30 M e 7 novos), sem staging/commit.

```text
 M desktop/BUSINESS_RULES_VALIDATION.md
 M desktop/README.md
 M desktop/config.example.json
 M desktop/packaging/AmazonAgroPropostas.spec
 M desktop/pyproject.toml
 M desktop/scripts/package_support.py
 M desktop/scripts/verify_export_ui.py
 M desktop/src/amazon_agro/app/smoke.py
 M desktop/src/amazon_agro/config/settings.py
 M desktop/src/amazon_agro/domain/models.py
 M desktop/src/amazon_agro/exporters/excel.py
 M desktop/src/amazon_agro/exporters/excel_map.py
 M desktop/src/amazon_agro/exporters/excel_pagination.py
 M desktop/src/amazon_agro/exporters/formatting.py
 M desktop/src/amazon_agro/integrations/workbook_inspector.py
 M desktop/src/amazon_agro/integrations/workbook_parser.py
 M desktop/src/amazon_agro/repositories/sqlite_property_catalog.py
 M desktop/src/amazon_agro/repositories/sqlite_proposals.py
 M desktop/src/amazon_agro/services/export_validator.py
 M desktop/src/amazon_agro/services/property_sync_service.py
 M desktop/src/amazon_agro/ui/pages.py
 M desktop/src/amazon_agro/ui/property_sources.py
 M desktop/src/amazon_agro/ui/review.py
 M desktop/src/amazon_agro/ui/summary.py
 M desktop/tests/test_business_definitions.py
 M desktop/tests/test_domain.py
 M desktop/tests/test_excel_export.py
 M desktop/tests/test_packaging.py
 M desktop/tests/test_pdf_export.py
 M desktop/tests/test_proposal_ui.py
?? desktop/HOTFIX_QA.md
?? desktop/src/amazon_agro/exporters/excel_layout.py
?? desktop/src/amazon_agro/resources/AmazonAgroLogo.png
?? desktop/src/amazon_agro/ui/currency_input.py
?? desktop/tests/test_financing_participation.py
?? desktop/tests/test_hotfix_finalization.py
?? desktop/tests/test_hotfix_qa.py
```
