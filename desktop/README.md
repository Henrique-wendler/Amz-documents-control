# Amazon Agro Propostas — aplicativo desktop

Aplicativo local em Python 3.12, PySide6, SQLite e SQLAlchemy. Esta pasta é independente do frontend React na raiz do repositório. Operações salvas podem ser reabertas e exportadas em XLSX, PDF ou nos dois formatos.

## Executar no Windows

    cd desktop
    py -3.12 -m venv .venv
    .\.venv\Scripts\python.exe -m pip install -e ".[dev]"
    .\.venv\Scripts\python.exe -m amazon_agro.app

Para usar o Excel instalado como conversor PDF, instale também a dependência opcional:

    .\.venv\Scripts\python.exe -m pip install -e ".[excel-com]"

Sem Microsoft Excel ou pywin32, instale LibreOffice e disponibilize soffice no PATH. Também é possível definir AMAZON_AGRO_SOFFICE com o caminho do executável. A seleção é automática: Excel COM primeiro, LibreOffice headless em seguida. Se nenhum funcionar, a aplicação mostra o erro. Não há dependência de Excel no domínio ou nos testes automatizados.

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

O exportador abre uma cópia do template com openpyxl, preenche as células mapeadas e preserva as propriedades estruturais do modelo. O XLSX final e a cópia temporária usada na conversão PDF têm área de impressão A1:M35, incluindo o rodapé documental e excluindo as centenas de linhas vazias formatadas no arquivo de referência. A página é configurada para caber em uma folha.

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

Na etapa **Imóveis**, a lista mostra fazendas, município/UF, o único proprietário abreviado ou a contagem de proprietários, quantidade de matrículas, área total derivada e origem. **Ver detalhes** mostra as parcelas e todos os seus titulares, com documentos mascarados e uma pessoa por linha; **Adicionar** permite escolher todas ou algumas matrículas. Quando município ou UF faltam, a janela **Informações complementares** exige o preenchimento antes da inclusão. **Editar informações locais** permite atualizar município/UF no SQLite, sem modificar a planilha. O complemento é reutilizado nas próximas propostas e entra na busca; não é inferido da planilha. Ao salvar, a proposta guarda nome, município, UF, origem, classificação e as matrículas selecionadas, com seus números, áreas, matrículas anteriores e lotes. A coleção de titulares não é copiada para o snapshot nem exportada no bloco de imóveis. Uma proposta antiga mantém seu snapshot após a edição local. Para uma única matrícula selecionada, o exportador atual usa o snapshot salvo. Para várias, a validação bloqueia a exportação com a decisão de layout indicada como pendente; a seleção permanece salva.

## Capacidade e diferenças dos modelos

O XLSX comporta 7 participantes nas linhas 9–15 e 4 linhas de imóveis nas linhas 28–31. Exceder o limite bloqueia a exportação com uma mensagem clara. A regra para distribuir fazendas com várias matrículas nessas quatro linhas ainda não foi definida. Os exemplos de participantes presentes no template são removidos do arquivo gerado, para que só apareçam participantes da operação salva.

No código 1 da classificação de imóvel, o XLSX usa “GARANTIA” e o DOCX usa “HIPOTECA”. O domínio armazena somente o código; os rótulos por template ficam na configuração. O exemplo da Amazon Agro aparece como participante tipo 6 no DOCX e “4 e 5” no XLSX; ele não é incluído automaticamente na proposta exportada. Essas divergências permanecem configuráveis e não são resolvidas nesta etapa. A planilha original contém apenas o texto “LOGO AMAZON”, sem imagem embutida. Ela não reserva uma célula para o valor monetário exato dos recursos próprios. A exportação usa G21 para indicar Sim/Não e H21 para o percentual; o valor monetário permanece no domínio, sem linha no documento. Após a legenda dos imóveis na linha 32, a linha 33 cria um pequeno espaço, A34 mostra o técnico responsável e A35 mostra cidade/data por extenso, conforme a referência documental. Os demais campos e células estão no mapeamento central em src/amazon_agro/exporters/excel_map.py.

Agência e fonte são exportadas quando preenchidas. Ainda não existem regras bancárias que permitam exigir esses campos para todos os casos. Não há Google Drive API, Google Sheets API, upload, escrita nas planilhas, sincronização remota ou servidor nesta etapa.

## Decisões de negócio pendentes

- Como representar várias matrículas na proposta final: uma linha por matrícula, várias na mesma célula, apenas as selecionadas ou outra regra; e como aplicar o limite de quatro linhas.
- Qual rótulo usar para a classificação 1 (DOCX: HIPOTECA; XLSX: GARANTIA).
- Qual tipo usar para Amazon Agro como participante (DOCX: 6; XLSX: 4 e 5) e quando incluí-la.
- Quais campos bancários, como agência e fonte, são obrigatórios por banco.
- Quais campos estáveis devem definir a identidade após renomeação de fazenda, troca de proprietário ou movimentação de arquivo.
- Como interpretar planilhas que compartilham uma área mesclada entre várias matrículas, ou que usam outro agrupamento não descrito pelo perfil atual.
- Qual fonte oficial fornecerá município/UF quando a planilha de origem não os informa; até essa definição, o usuário complementa esses dados localmente antes de adicionar a fazenda.

Propostas antigas salvas antes da introdução dos snapshots continuam legíveis no SQLite, mas dependem da fonte original para completar dados que nunca foram gravados. Ao salvar uma dessas propostas enquanto a fonte ainda existir, o aplicativo preenche o snapshot; não há como reconstruir automaticamente dados ausentes de uma fonte já perdida.

## Estrutura

- src/amazon_agro/app/: inicialização e composição
- src/amazon_agro/domain/: entidades e validação do domínio
- src/amazon_agro/services/: operações, validação e orquestração da exportação
- src/amazon_agro/repositories/: SQLite de propostas e catálogo, contratos e imóveis demonstrativos de teste
- src/amazon_agro/exporters/: mapeamento XLSX, formatação e conversores PDF
- src/amazon_agro/ui/: operação, participantes, proposta, seleção de imóveis, revisão e configuração das fontes
- src/amazon_agro/config/: template, caminhos e rótulos configuráveis
- src/amazon_agro/integrations/: descoberta, inspeção, perfil e parser somente leitura de workbooks
- tests/: domínio, persistência, catálogo sintético, snapshots, XLSX, validação e conversão PDF simulada
