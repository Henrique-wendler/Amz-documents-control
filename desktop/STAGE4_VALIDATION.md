# Etapa 4 — interface do gerador de propostas

## Escopo e preservação

Checkpoint inicial: 199 testes aprovados, build React aprovado e árvore Git limpa.
Alterações restritas ao desktop. Parser BASA, normalização de proprietários,
snapshots, enriquecimento local, esquema do catálogo, template e frontend React
foram preservados. Nenhuma planilha real foi modificada. Todos os dados usados
nos novos testes são sintéticos. Não houve integração com APIs nem instalador.

## Diagnóstico dos botões

A reprodução anterior à correção abriu `MainWindow` na plataforma Qt `windows`
com bancos temporários. Na revisão de uma proposta incompleta, `QTest.mouseClick`
encontrou o botão Excel desabilitado e `QSignalSpy` registrou **zero sinais**.
O ID da proposta estava presente, o template existia e Excel COM estava disponível.
`ReviewPage.set_validation_errors` desabilitava os três botões: assim o clique
não chegava ao slot que mostraria o diálogo de pendências. As conexões existiam.
Esse é o comportamento reproduzido; não é possível afirmar que explica sozinho
todo incidente observado em outro computador.

Agora os botões permanecem acionáveis. O fluxo passa por coleta → validação →
escolha da pasta → salvamento com ID → serviço/exportador → confirmação de
arquivos finais → diálogo de sucesso. Cancelar a pasta informa o cancelamento
na barra de status. Falta de campos mostra uma lista em diálogo. Falhas de
permissão, destino, arquivo existente e erro inesperado recebem mensagens
amigáveis, com detalhes técnicos no log. Arquivos existentes são preservados.

XLSX não consulta o backend PDF. PDF verifica Excel COM e depois LibreOffice;
quando indisponível, oferece **Gerar Excel** e **Fechar**. O sucesso lista apenas
arquivos existentes, permite escolher um resultado e abrir arquivo/pasta.

Nos ensaios reais, a finalização COM apresentou demora mesmo depois de criar
o PDF temporário. O diagnóstico apontou a liberação COM após fechar o Excel.
As referências agora são liberadas antes de `CoUninitialize`, e somente a
conversão roda em worker Qt. O banco e a coleta dos formulários ficam na thread
principal. A janela continua processando eventos e protege a proposta enquanto
aguarda. Ainda pode haver espera no encerramento do Office; não há timeout
forçado para COM nem encerramento de processos do usuário.

## Evidência de geração real

`desktop/scripts/verify_export_ui.py` executou com a plataforma `windows`,
SQLite isolado, template original e backend **Excel COM real**:

| Ação | Sinais de clique | Resultado |
| --- | ---: | --- |
| Gerar Excel | 1 | XLSX final, reaberto com openpyxl, células de proposta/proponente/imóvel conferidas |
| Gerar PDF | 1 | PDF final, com uma página e proponente preenchido |
| Gerar Excel + PDF | 1 | Ambos os arquivos finais, PDF com uma página |

O próprio Excel abre a cópia XLSX preenchida para produzir o PDF. Os PDFs foram
também lidos com pypdf e renderizados para inspeção: tabela, imóvel e rodapé
estão na mesma página. Hash do template inalterado; `foreign_key_check` vazio e
`integrity_check = ok` nos dois bancos temporários.

Evidência local, excluída do Git: `.tmp/stage4/verified-export/report.json`,
arquivos nas subpastas `xlsx`, `pdf`, `both` e log da exportação. O script usa
cliques QTest e diálogos reais Qt, com seleção automática da pasta. Não usa
exportadores simulados. **Não foi um teste manual humano**: o controle de janelas
da ferramenta Computer Use falhou na inicialização do sandbox, inclusive após
reinicialização. A conferência manual pelo usuário permanece recomendada antes
de considerar a aceitação visual encerrada. Abertura pelo aplicativo padrão e
Explorador foi coberta por testes dos botões/URLs, sem automatizar esses apps.

## Resumo, onboarding e apresentação

`ProposalSummaryPanel` acompanha os sinais de edição, participantes e imóveis,
incluindo município e matrículas. Não exige salvar e mascara CPF/CNPJ. Recebe
`ValidationResult` do mesmo validador da geração; a UI não mantém outra lista
de regras. Coletar o rascunho não modifica os snapshots salvos.

O assistente inicial permite pular a pasta Drive, selecionar saída, detectar
conversores e definir cidade/técnico. Só grava `first_run_completed` ao concluir
com sucesso. Cancelar ou falhar na gravação preserva as preferências anteriores.
Na segunda abertura o assistente não reaparece; pode ser repetido em Geral.

O editor possui navegação, formulário e resumo em QSplitter. Resumo pode ser
recolhido, há rolagem vertical nos formulários, campos agrupados, moeda/data
brasileiras, feedback de formato do documento, QSS centralizado, foco visível,
labels associados e atalhos. A revisão mantém as quatro ações, com ambos como
ação principal. Configurações ficam no cabeçalho. Sem rascunho aberto, há uma
tela para criar/abrir. Estados das etapas não impedem navegação livre.

Testes geométricos aprovados em **1366×768 e 1920×1080**, sem barra horizontal
da aplicação ou cortes por largura mínima nas cinco páginas. Ensaios nativos
também registraram essas dimensões; em uma repetição o Windows limitou a altura
solicitada de 1080 a 975 conforme a área disponível. Tabelas mantêm sua própria
rolagem para colunas. Não foram geradas capturas de tela do aplicativo.

## Preparação para empacotamento

Template localizado pelo pacote, independentemente do diretório corrente. Para
modo frozen, resolução em `sys._MEIPASS/amazon_agro/templates`; esse recurso
deverá ser incluído no futuro bundle. Caminhos relativos explícitos usam a pasta
do JSON. Configurações e bancos permanecem em LOCALAPPDATA. Sem PyInstaller,
Inno Setup, MSI ou NSIS nesta etapa.

## Arquivos criados/modificados

Criados:
- `src/amazon_agro/ui/summary.py`
- `src/amazon_agro/ui/theme.py`
- `src/amazon_agro/ui/onboarding.py`
- `src/amazon_agro/ui/settings_dialog.py`
- `src/amazon_agro/ui/export_dialogs.py`
- `src/amazon_agro/ui/conversion_worker.py`
- `tests/test_proposal_ui.py`
- `scripts/verify_export_ui.py`
- `STAGE4_VALIDATION.md`

Modificados:
- `src/amazon_agro/app/main.py`
- `src/amazon_agro/config/settings.py`
- `src/amazon_agro/services/export_validator.py`
- `src/amazon_agro/exporters/pdf.py`
- `src/amazon_agro/exporters/pdf_backends.py`
- `src/amazon_agro/ui/main_window.py`
- `src/amazon_agro/ui/pages.py`
- `src/amazon_agro/ui/property_selection.py`
- `src/amazon_agro/ui/review.py`
- `tests/test_pdf_export.py`
- `README.md`

## Decisões de negócio preservadas

Continuam pendentes: representação de múltiplas matrículas no documento e limite
de linhas; rótulo da classificação 1; tipo/inclusão da Amazon Agro como
participante; obrigatoriedade de agência/fonte por banco; identidade de fazenda
após renomeações/movimentações; interpretação de áreas compartilhadas entre
matrículas; fonte oficial de município/UF. Nenhuma dessas regras foi inventada
na interface. A validação preexistente não exige imóvel quando a lista está
vazia; tornar essa seleção obrigatória demanda definição de negócio.
