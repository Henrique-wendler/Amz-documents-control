# Amazon Agro Propostas — aplicativo desktop

Aplicativo local em Python 3.12, PySide6, SQLite e SQLAlchemy. Esta pasta é independente do frontend React na raiz do repositório. Operações salvas podem ser reabertas e exportadas em XLSX, PDF ou nos dois formatos.

## Executar no Windows

    cd desktop
    py -3.12 -m venv .venv
    .\.venv\Scripts\python.exe -m pip install -e ".[dev]"
    .\.venv\Scripts\python.exe -m amazon_agro.app

Para usar o Excel instalado como conversor PDF, instale também a dependência opcional:

    .\.venv\Scripts\python.exe -m pip install -e ".[excel-com]"

Sem Microsoft Excel ou pywin32, instale LibreOffice e disponibilize soffice no PATH. Também é possível definir AMAZON_AGRO_SOFFICE com o caminho do executável. A seleção é automática: Excel COM primeiro, LibreOffice headless em seguida. Se nenhum funcionar, a aplicação mostra o erro. O domínio e a suíte portátil não dependem do Excel; os cinco testes opcionais de conversão nativa usam Excel COM.

Para executar os testes:

    .\.venv\Scripts\python.exe -m pytest

## Template e configuração

O template válido está incluído no pacote em src/amazon_agro/templates/modelo_proposta.xlsx. Ele deriva de “modelo proposta (1).xlsx”, com uma pequena área documental acrescentada após a tabela de imóveis; o arquivo original enviado não é alterado. “Modelo Proposta.docx” é a referência documental e visual principal, enquanto o XLSX é o template técnico de preenchimento. A tela “Nova operação” orienta os dados administrativos internos. Por padrão, o aplicativo usa a cópia incluída no pacote. Para usar outro caminho, copie config.example.json para %LOCALAPPDATA%\AmazonAgro\config.json e preencha xlsx_template_path. O template alternativo deve preservar as células e mesclagens mapeadas, inclusive o rodapé documental. Caminhos relativos na configuração são resolvidos a partir da pasta do arquivo config.json. AMAZON_AGRO_CONFIG permite indicar outro arquivo de configuração.

A planilha “Demandas - Amazon Agro.xlsx” não faz parte deste projeto e é excluída da descoberta por padrão. A instalação normal inicia com o catálogo de imóveis vazio se nenhuma pasta estiver configurada. `FakePropertyRepository` permanece apenas para testes e uso demonstrativo explícito.

O banco local fica em %LOCALAPPDATA%\AmazonAgro\proposals.sqlite3. O log de exportação fica em %LOCALAPPDATA%\AmazonAgro\exports.log e não registra CPF/CNPJ. default_output_dir na configuração define a pasta inicial do seletor; sem configuração, a sugestão é %LOCALAPPDATA%\AmazonAgro\exports.

## Gerar arquivos

1. Preencha a operação, participantes, proposta e imóveis.
2. Abra Revisão. Os botões indicam os campos mínimos ainda ausentes.
3. Clique em Salvar operação, Gerar Excel, Gerar PDF ou Gerar Excel + PDF.
4. Escolha uma pasta. A exportação salva a operação antes de carregar seus dados do SQLite e gerar os arquivos.

Os nomes seguem numero_proponente_proposta.xlsx e numero_proponente_proposta.pdf, com caracteres inválidos sanitizados. Arquivos existentes não são substituídos. Em “Gerar Excel + PDF”, o PDF é convertido a partir do mesmo XLSX preenchido; os dois arquivos só são publicados depois de ambas as gerações funcionarem.

O exportador abre uma cópia do template com openpyxl e adapta sua apresentação à referência visual “Modelo Proposta.docx”: tabelas com bordas, mesclas, alinhamentos, títulos e logo oficial. O template permanece intacto. A logo foi recortada do asset incorporado ao modelo, com autorização do usuário, sem redesenho e sem o restante do papel timbrado. Pillow permite incorporar a imagem ao XLSX. A página inicial imprime A1:M35; matrículas adicionais usam páginas de continuação. O PDF converte esse mesmo XLSX preenchido.

## Catálogo local de imóveis

Em **Configurações > Imóveis**, escolha a **Pasta sincronizada pelo Google Drive for Desktop**, os padrões de arquivo (`*.xlsx; *.xlsm`), a opção de subpastas e o perfil. O Drive for Desktop faz a sincronização com a pasta local do Windows; a aplicação trata essa pasta como uma fonte comum do sistema operacional. O caminho é salvo como `source_directory` em `%LOCALAPPDATA%\AmazonAgro\config.json` e nunca é fixo no código. A aplicação não usa Google Drive API, Google Sheets API, OAuth, login Google, tokens, Google Cloud, HTTP ou sincronização própria nesta versão. Uma integração por API poderá ser desenvolvida futuramente como outro adapter e está fora do escopo atual. O botão **Atualizar catálogo** descobre os arquivos, ignora `~$` e arquivos ocultos, calcula um hash e processa somente arquivos novos, alterados ou afetados por uma mudança no perfil. Os XLSX/XLSM são abertos somente para leitura e nunca são modificados. O catálogo fica em `%LOCALAPPDATA%\AmazonAgro\properties.sqlite3`, separado das propostas.

`PropertyWorkbookProfile` descreve uma família de planilhas: seleção de aba, busca do cabeçalho, aliases de colunas, extração do proprietário, agrupamento e composição dos IDs. O perfil inicial **BASA Ambiental** reconhece por cabeçalho Fazenda, Área, Matrículas, Matrícula Anterior, Lote/Gleba, Proprietário, CPF/CNPJ, CCIR, ITR, CAR e, quando houver, Município/UF. `property_profile_options` no JSON pode alterar aliases, aba, número de linhas examinadas, campos dos IDs, células do proprietário e a opção `inherit_unmerged_property_name`. Essa última opção fica desligada por padrão: uma célula vazia comum não é tratada automaticamente como a fazenda acima. `property_profiles` define outras famílias e `property_profile_rules` associa padrões de nomes a elas, por exemplo `[{"pattern":"ambiental-*.xlsx","profile":"Outra Família"}]`. Arquivos sem regra usam o perfil padrão; regras conflitantes levam a **Precisa configurar**. A tela permite atribuir um perfil conhecido a um arquivo específico; essa escolha é salva em `property_file_profiles` e prevalece sobre regras por padrão.

`WorkbookInspector` apresenta abas, primeiras linhas, candidatos de cabeçalho, nomes de colunas, mesclagens e preview. O perfil padrão exige somente Fazenda e Matrícula; os demais campos são opcionais. Uma mesclagem vertical de Fazenda delimita o grupo e uma mesclagem de Matrícula delimita uma única parcela, inclusive suas linhas de complemento. Linhas visuais, vazias e observações sem estrutura suficiente não criam entidades. Dados de parcela sem vínculo determinístico geram diagnóstico com a linha, sem expor CPF/CNPJ. Área, matrícula anterior e lote só podem ser compartilhados por uma mesclagem que cubra uma única matrícula. Uma área mesclada sobre matrículas distintas, uma linha de matrícula sem fazenda identificável, cabeçalhos incompatíveis ou identidades duplicadas levam a **Precisa configurar**. Fórmulas/erros Excel em campos mapeados também exigem revisão, sem usar silenciosamente caches ausentes. Arquivos corrompidos ficam em **Erro**. Nenhum desses casos é importado parcialmente.

`parse_area_ha` aceita números Excel e textos com vírgula ou ponto decimal, espaços e sufixo `ha`/`há` sem distinguir maiúsculas. Retorna `Decimal`; `None` e texto vazio representam área ausente, nunca zero. Um ponto isolado é decimal; milhares brasileiros são aceitos somente no formato completo, como `1.234,5678`. Texto arbitrário, unidades diferentes, agrupamentos inválidos, valores negativos e não finitos produzem diagnóstico. Conversões válidas não geram aviso.

CCIR/ITR/CAR são preservados nos `extra_fields` de cada parcela. Só aparecem também no nível da fazenda quando todas as parcelas possuem o mesmo valor. Não há preenchimento genérico de células vazias. Cada matrícula pode ter zero ou vários titulares da fonte, ligados por IDs (`ParcelOwner` → `PropertyOwner`). Várias linhas de proprietário dentro da mesma matrícula mesclada produzem uma parcela com várias relações. Proprietários de uma matrícula não são atribuídos às demais. Esses vínculos reproduzem a planilha, sem interpretar titularidade jurídica, percentuais ou preferências. Avisos não bloqueantes ficam no diagnóstico da fonte e no tooltip existente, inclusive quando o status é **OK**. A assinatura de sincronização inclui a versão do parser para reprocessar fontes após sua atualização.

Cada fazenda (`RuralProperty`) contém suas matrículas (`PropertyParcel`). Os IDs de fazenda e parcela continuam usando hashes determinísticos dos campos configurados. Nos grupos anteriormente válidos com um proprietário, os mesmos valores de identidade são preservados. Quando há vários titulares, nenhum é escolhido como principal para compor a identidade. IDs de fazenda e parcela não dependem da linha do Excel. Arquivos com nomes parecidos continuam origens distintas. A identidade após mudanças de nome/proprietário ou movimentação de arquivos continua uma decisão pendente.

`PropertyOwner` armazena ID, nome e documento textual. Um CPF/CNPJ com formato normalizável identifica a mesma pessoa no catálogo local; isso não valida juridicamente o documento. Sem documento normalizável, a identidade fica restrita à ocorrência física da fonte. Nomes iguais ou parecidos em células independentes não são unidos. Uma célula de proprietário realmente mesclada pode indicar uma ocorrência compartilhada. A associação preserva também as grafias de nome e documento encontradas na fonte, inclusive variações de um mesmo documento. Contagens de titulares são derivadas das relações. Os campos `owner_name`/`owner_document` da fazenda são apenas compatibilidade: ficam vazios quando há vários titulares normalizados e nunca são usados para distribuir pessoas entre matrículas.

A migração versionada do catálogo SQLite acrescenta `property_owners`, `parcel_owners` e a indicação de normalização, em transação e sem excluir bancos. As relações possuem chaves estrangeiras e unicidade por matrícula/proprietário. Os dados legados e o complemento local são preservados. Como o campo agregado antigo não prova quais parcelas pertencem a cada titular, a migração não inventa associações: invalida a assinatura da fonte para reconstruí-las na próxima atualização das planilhas. Enquanto uma fonte estiver indisponível, a busca legada continua funcionando e os detalhes sinalizam que é necessário atualizá-la. Reabrir o catálogo não repete a migração nem invalida novamente as fontes. `proposals.sqlite3` não participa dessa migração.

O SQLite guarda arquivos de origem, hash, datas, perfil, estado, fazendas, matrículas, titulares e suas relações. A busca local indexada consulta nome, matrícula atual/anterior, qualquer titular associado, documento com ou sem pontuação, CCIR, ITR, CAR, lote, município e UF sem abrir o Excel a cada pesquisa. O resultado continua sendo a fazenda, uma única vez. Se a pasta sincronizada estiver temporariamente indisponível, a atualização informa o erro e mantém o último catálogo válido pesquisável. Um arquivo removido de uma pasta acessível torna sua origem inativa no catálogo, preservando o registro e as propostas. Se a atualização de um arquivo falhar, o último catálogo válido desse arquivo permanece disponível com estado de aviso. A tabela de fontes mostra **OK**, **Precisa configurar**, **Erro** ou **Origem ausente**.

Na etapa **Imóveis**, a lista mostra fazendas, município/UF, o único proprietário abreviado ou a contagem de proprietários, quantidade de matrículas, área total derivada e origem. **Ver detalhes** mostra as parcelas e todos os seus titulares, com documentos mascarados e uma pessoa por linha. **Adicionar** começa sem matrículas marcadas: o usuário escolhe individualmente quais incluir e define a classificação de cada uma. **Selecionar / classificar** permite revisar a seleção e as classificações da fazenda adicionada. Quando município ou UF faltam, a janela **Informações complementares** exige o preenchimento antes da inclusão. **Editar informações locais** permite atualizar município/UF no SQLite, sem modificar a planilha. O complemento é reutilizado nas próximas propostas e entra na busca; não é inferido da planilha. Ao salvar, a proposta guarda nome, município, UF e origem da fazenda, além de ID, matrícula textual, classificação, área, matrícula anterior e lote de cada parcela escolhida. Somente as parcelas escolhidas entram no snapshot e no documento. A coleção de titulares não é copiada para o snapshot nem exportada no bloco de imóveis. Alterações posteriores no catálogo ou nos defaults não modificam esses valores históricos.

## Capacidade e diferenças dos modelos

O XLSX comporta 7 participantes nas linhas 9–15; exceder esse limite ainda bloqueia a exportação. Cada matrícula selecionada ocupa uma linha de imóveis, com sua própria classificação. As primeiras quatro ficam nas linhas 28–31 da página inicial. As seguintes entram em blocos de continuação de quatro linhas por página: 5–8 na página 2, 9–12 na página 3 e assim por diante. Os blocos repetem identidade da proposta, proponente, cabeçalhos de imóveis, legenda, técnico e data, copiando fontes, mesclas, bordas, alinhamentos e alturas do modelo. Cada página tem uma área de impressão e quebra explícita no mesmo worksheet; o ajuste vertical global fica desativado para documentos com várias páginas. O PDF usa essas mesmas áreas, sem limitar novamente a impressão a A1:M35. Os exemplos de participantes presentes no template são removidos, para que só apareçam os participantes salvos.

O código 1 de imóveis significa oficialmente **Hipoteca**. Os códigos e snapshots gravados são preservados. A **Amazon Agro Consultoria e Projetos LTDA**, CNPJ **07.778.284/0001-90**, é adicionada apenas ao criar uma nova proposta; pode ser editada, substituída ou removida. Seu tipo padrão aprovado é **1 — Emitente principal**, editável na proposta. Nome, documento e tipo padrão podem ser atualizados na configuração (`default_consultancy_name`, `default_consultancy_document`, `default_consultancy_type`). Configurações anteriores da Amazon Agro com documento vazio passam a usar o CNPJ oficial para novas propostas; participantes já salvos não são reescritos. Configurações sem a chave de tipo usam 1. Reabrir uma proposta preserva seu tipo salvo e não reinclui um participante removido. O placeholder “LOGO AMAZON” é substituído pela imagem oficial na cópia exportada. Recursos Próprios permanecem somente Sim/Não em G21 e percentual em H21; o valor monetário permanece no domínio, sem linha adicional no documento. Após a legenda dos imóveis na linha 32, A34 mostra o técnico responsável e A35 mostra cidade/data por extenso. Os demais campos e células estão no mapeamento central em src/amazon_agro/exporters/excel_map.py.

## Hotfix após QA manual

Status / Etapa / Banco e Aguardando foram retirados do fluxo atual; suas colunas legadas permanecem no SQLite. Os valores monetários usam entrada brasileira com `Decimal`, seleção inicial do zero, edição de teclado e colagem, sem alteração pela roda do mouse. A página Proposta separa Descrição e Valor Total, FNO, OF e Recursos próprios em cards; Laudo ABC pertence ao card FNO. Recursos próprios não possui input monetário: somente Sim/Não e percentual condicional. Participação FNO/OF aparece somente para leitura, junto ao respectivo valor. ASTEC FNO e OF têm escolhas Sim/Não independentes. Em Sim, cada fonte mostra seu percentual editável, persiste e exporta esse percentual; em Não, ele fica oculto/desabilitado e não é exportado. Percentuais ativos são validados entre 0 e 100, com Decimal.

**CLASS. DA % = participação percentual de FNO e OF sobre o Valor Total**, conforme definição oficial desta versão. As fórmulas são `(valor_fno / valor_total) * 100` e `(valor_of / valor_total) * 100`, usando `Decimal`, com duas casas somente na apresentação. Total zero mostra `0,00%` para ambos. O denominador é sempre Total; recursos próprios não são descontados dele, e a soma dos percentuais pode ser menor que 100%. Os resultados são recalculados na edição/reabertura e exportados em D23/D25, identificados como **PARTICIPAÇÃO FNO/OF**, ao lado dos valores A23/A25. Não há entrada manual nem novas colunas SQLite para esses resultados; `classificacao_da_percentual` continua armazenado por compatibilidade, sem determinar os resultados atuais. FNO, OF ou sua soma maiores que Total geram mensagens claras e impedem a exportação; a gravação de propostas parcialmente preenchidas continua permitida.

Laudo ABC usa opções exclusivas Sim/Não. Em Sim, o percentual é editável e o valor é somente leitura, calculado com `Decimal` por **Valor FNO × percentual ABC / 100**, com atualização imediata ao editar FNO ou percentual. Total R$ 100.000,00 / FNO R$ 70.000,00 / OF R$ 30.000,00 / ABC 5,00% resulta em R$ 3.500,00. FNO R$ 80.000,00 resulta em R$ 4.000,00. Mudar somente Total não altera ABC; o Laudo não pertence ao OF. Em Não, os dois campos ficam ocultos/desabilitados e não são exportados. O rótulo documental permanece **LAUDO ABC FINANCIADO?**; o valor legado continua armazenável, mas não determina o cálculo ou o documento atual.

Recursos próprios, ASTEC FNO, Laudo ABC e ASTEC OF usam o mesmo componente Sim/Não. Recursos próprios guarda a escolha explícita em `possui_recursos_proprios`, uma coluna nullable adicionada transacionalmente aos bancos existentes; no legado, a escolha é inferida dos valores anteriores até a próxima edição. A opção Não tem percentual efetivo zero. O valor monetário antigo é preservado no SQLite e não aparece no fluxo atual. ASTEC oculta somente seu percentual em Não; os valores FNO/OF permanecem visíveis. O documento identifica o percentual junto à respectiva ASTEC e a seção ABC como exclusiva do FNO. Participação FNO/OF continua automática e somente leitura: valor da fonte / Valor Total × 100.

Cabeçalho com logo oficial e ação Nova proposta destacada; navegação leve, resumo recolhível com Total/FNO/OF em destaque e campos calculados distintos dos editáveis. Pendências de preenchimento usam laranja; composição financeira impossível usa vermelho e nunca recebe status pronta para gerar. Veja [PROPOSAL_UI_VALIDATION.md](PROPOSAL_UI_VALIDATION.md) para regras, compatibilidade, testes e prévias desta revisão.

A tela de imóveis lista nomes, perfil, status, contagem derivada de fazendas e diagnóstico visível. O seletor do Windows escolhe pastas; os XLSX/XLSM aparecem na lista da aplicação. Falhas de leitura orientam disponibilizar os arquivos off-line e tentar novamente, preservando o último catálogo válido. Para arquivos sem atribuição explícita, se o perfil padrão de outra família for incompatível, a estrutura BASA pode ser detectada automaticamente pelos cabeçalhos. A escolha manual prevalece.

Blocos adjacentes com mesclas separadas de nome/matrícula podem formar uma fazenda quando uma mescla física compartilhada de CCIR/ITR/CAR comprova o vínculo e todas as matrículas abrangidas têm o mesmo nome de fazenda. Apenas nomes ou documentos iguais não autorizam unir blocos separados. A validação está em [HOTFIX_QA.md](HOTFIX_QA.md).

Todos os bancos usam o mesmo `ProposalExportValidator` e os mesmos campos obrigatórios. Agência e fonte são exportadas quando preenchidas; nenhuma obrigatoriedade nova foi criada. Não há Google Drive API, Google Sheets API, upload, escrita nas planilhas, sincronização remota ou servidor nesta etapa.

## Decisões de negócio pendentes

- Quais campos estáveis devem definir a identidade após renomeação de fazenda, troca de proprietário ou movimentação de arquivo.
- Como interpretar planilhas que compartilham uma área mesclada entre várias matrículas, ou que usam outro agrupamento não descrito pelo perfil atual.
- Qual fonte oficial fornecerá município/UF quando a planilha de origem não os informa; até essa definição, o usuário complementa esses dados localmente antes de adicionar a fazenda.

Propostas antigas salvas antes da introdução dos snapshots continuam legíveis no SQLite, mas dependem da fonte original para completar dados que nunca foram gravados. Ao salvar uma dessas propostas enquanto a fonte ainda existir, o aplicativo preenche o snapshot; não há como reconstruir automaticamente dados ausentes de uma fonte já perdida.

Snapshots antigos com classificação somente na fazenda recebem a coluna `classificacao` em cada parcela, preenchida uma única vez a partir do vínculo da fazenda. A migração é transacional e idempotente, preserva IDs, seleção e propostas, e não altera classificações individuais já salvas. `ProposalProperty.classificacao` permanece como compatibilidade legada; o documento novo usa `ProposalPropertyParcel.classificacao`.

Os testes de paginação com Excel COM são opcionais fora do Windows com Excel. Para executá-los, defina `AMAZON_AGRO_PDF_READER_PYTHON` com o caminho de um Python que possua `pypdf`, e rode `pytest` normalmente. Eles convertem 1, 4, 5, 8 e 9 matrículas, conferem as páginas reais e verificam o texto de cada matrícula no PDF.

## Interface e primeira execução (etapa 4)

Na primeira abertura, o assistente configura uma pasta local opcional do Google Drive for Desktop, a pasta das propostas, cidade e técnico padrão. A detecção de PDF respeita Excel COM → LibreOffice. Concluir salva `first_run_completed`; cancelar não grava uma configuração parcial. Em **Configurações → Geral**, é possível alterar os padrões ou executar o assistente novamente. O catálogo continua sendo atualizado explicitamente em **Configurações → Imóveis**.

Sem proposta aberta, a tela inicial oferece criar ou abrir. O editor usa navegação, formulário com rolagem vertical e `ProposalSummaryPanel` lateral redimensionável/recolhível. O resumo acompanha a edição sem salvar, mascara o documento e recebe as pendências do mesmo `ProposalExportValidator` usado na exportação. A revisão completa permanece como última etapa. As preferências ficam fora das etapas. Atalhos: `Ctrl+N`, `Ctrl+O`, `Ctrl+S` e `Ctrl+,`.

Os botões de geração continuam acionáveis quando existem pendências: um clique explica os campos que precisam ser preenchidos. A proposta é salva antes da geração. XLSX independe de PDF; sem conversor há a alternativa **Gerar Excel**. Erros técnicos são registrados em `exports.log`, com mensagem amigável na interface. O sucesso lista somente arquivos efetivamente produzidos, permite escolher qual abrir e oferece abrir a pasta. Arquivos existentes não são sobrescritos.

A conversão Office roda em uma thread separada, mantendo o event loop Qt ativo; o formulário e as ações que trocam a proposta ficam bloqueados durante a geração. O SQLite permanece na thread principal. A janela aguarda a conversão para fechar. O backend COM libera as referências antes de `CoUninitialize`. A disponibilidade do Excel não garante tempo de resposta: add-ins ou diálogos do Office ainda podem prolongar a conversão. Não há encerramento forçado das instâncias do usuário.

Para repetir a verificação optativa com janela Windows, diálogos Qt, SQLite isolado, dados sintéticos e exportadores reais:

```powershell
.\desktop\.venv\Scripts\python.exe desktop/scripts/verify_export_ui.py --output .tmp/stage4/nova-verificacao
```

A pasta de saída deve ser nova. O script confirma os cliques, os arquivos, células preenchidas, as duas resoluções, a integridade SQLite e o hash do template. Se não houver conversor, registra PDF como indisponível. Essa é uma verificação automatizada da janela real, não uma declaração de teste manual humano. A suíte normal não requer Office.

### Preparação de recursos

O template padrão usa o caminho do pacote; no modo frozen usa `sys._MEIPASS/amazon_agro/templates/modelo_proposta.xlsx`. No futuro empacotamento, esse arquivo deverá ser incluído nesse destino. Caminhos configurados relativos são resolvidos em relação ao JSON, inclusive quando ele ainda não existe. Configuração e bancos continuam em `%LOCALAPPDATA%/AmazonAgro`. Nenhum instalador foi criado nem dependência de empacotamento foi instalada.

## Diretórios do código

## BUILD WINDOWS

Quem gera o pacote precisa de Windows x64, Python 3.12 x64 e Inno Setup. Execute
na raiz do repositório:

```powershell
.\desktop\scripts\build_windows.ps1 -PrepareEnvironment -IsccPath "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" -TestPdf
```

O comando gera `desktop/dist/AmazonAgroPropostas/AmazonAgroPropostas.exe` e
`desktop/installer-output/AmazonAgroPropostas-Setup-0.1.0.exe`, com SHA-256.
Versão central em `src/amazon_agro/version.py`. SQLAlchemy é construído em Python
puro; configurações, bancos e logs continuam em LOCALAPPDATA. Excel/LibreOffice
e Drive for Desktop permanecem opcionais e externos ao pacote.

Preparação, testes, política de dados, ícone oficial pendente, assinatura e
validação no segundo computador: [guia de build](packaging/README.md).

## INSTALAÇÃO PARA USUÁRIO FINAL

1. Execute `AmazonAgroPropostas-Setup-0.1.0.exe`.
2. Avance com **Próximo**.
3. Clique em **Instalar**.
4. Abra **Amazon Agro Propostas** pelo Menu Iniciar.
5. Conclua a configuração inicial; a pasta de imóveis pode ser escolhida depois.

Não é necessário instalar Python nem ferramentas de desenvolvimento. A geração
de PDF usa Excel ou LibreOffice quando disponível. Desinstalar preserva suas
propostas e configurações em LOCALAPPDATA.

## Estrutura do código

- src/amazon_agro/app/: inicialização e composição
- src/amazon_agro/domain/: entidades e validação do domínio
- src/amazon_agro/services/: operações, validação e orquestração da exportação
- src/amazon_agro/repositories/: SQLite de propostas e catálogo, contratos e imóveis demonstrativos de teste
- src/amazon_agro/exporters/: mapeamento XLSX, formatação e conversores PDF
- src/amazon_agro/ui/: operação, participantes, proposta, seleção de imóveis, revisão e configuração das fontes
- src/amazon_agro/config/: template, caminhos e rótulos configuráveis
- src/amazon_agro/integrations/: descoberta, inspeção, perfil e parser somente leitura de workbooks
- tests/: domínio, persistência, catálogo sintético, snapshots, XLSX, validação e conversão PDF simulada
