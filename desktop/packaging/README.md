# Build Windows — Amazon Agro Propostas

## Produzir o instalador

Somente quem gera a distribuição precisa de Windows x64, Python **3.12 x64**,
ambiente de desenvolvimento funcional e Inno Setup 6.7.3 ou posterior. A versão
inicial usa PyInstaller 6.x em **onedir**, sem UPX. O usuário final recebe apenas
o Setup e não instala Python nem ferramentas de desenvolvimento.

Na raiz do repositório, em PowerShell:

```powershell
.\desktop\scripts\build_windows.ps1 -PrepareEnvironment -IsccPath "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" -TestPdf
```

O script prepara `.venv-build` separado do desenvolvimento, instala os extras
`dev,excel-com,packaging`, constrói SQLAlchemy em Python puro, valida o ambiente,
limpa somente `desktop/build`, `desktop/dist`, `desktop/installer-output`, executa
os testes, congela a aplicação, audita os arquivos e executa o EXE com PATH
limitado ao System32. Depois compila o Setup e escreve seu SHA-256. Não limpa
fontes, bancos, configurações, exportações ou a `.venv` de desenvolvimento.
O PATH também é limitado durante o PyInstaller, evitando que DLLs de ferramentas
do desenvolvedor, como o ICU do Poppler, sejam coletadas por engano. Uma falha
ou bloqueio do smoke interrompe o fluxo antes de produzir o instalador.

Em builds seguintes, a opção `-PrepareEnvironment` pode ser omitida se a versão
e as dependências instaladas já estiverem atualizadas. `-PythonPath` permite
indicar explicitamente outro Python de build compatível. Sem Inno Setup, a
distribuição onedir e o smoke podem ser produzidos, mas o script informa que
**nenhum Setup foi criado**. O compilador não é baixado automaticamente pelo
script; obtenha-o na [distribuição oficial](https://jrsoftware.org/isdl.php).

Saídas:

- `desktop/dist/AmazonAgroPropostas/AmazonAgroPropostas.exe`
- `desktop/installer-output/AmazonAgroPropostas-Setup-0.1.0.exe`
- o arquivo `.exe.sha256` correspondente
- `desktop/build/distribution-manifest.json` e `desktop/build/smoke-onedir/report.json`

O diretório inteiro da distribuição é necessário para executar o EXE fora do
instalador. Não copie apenas o executável. Os artefatos gerados não são versionados.

## Versão e recursos

Altere apenas `src/amazon_agro/version.py` para mudar `__version__`, no formato
MAJOR.MINOR.PATCH. O setuptools lê esse atributo; o spec e o script Inno recebem
a mesma identidade. Reexecute o build com `-PrepareEnvironment` após a alteração.
O AppId deve permanecer estável em todas as versões.

O `.spec` declara Analysis → PYZ → EXE sem os binários → COLLECT, resultando em
onedir. Inclui PySide6/Qt, SQLAlchemy SQLite, openpyxl, pythoncom/pywintypes e os
módulos COM. O tema QSS está em módulo Python e segue no arquivo de código
congelado. Metadata/licenças das dependências são preservadas; `direct_url.json`
e registros do ambiente editable são omitidos. A lista de dados da aplicação
permite somente o template autorizado e o ícone opcional. A auditoria verifica
hash do template e recusa dados privados e extensões C opcionais do SQLAlchemy.

O ícone em `packaging/resources/AmazonAgro.svg` é **provisório**, pois não foi
fornecido um asset oficial. `AmazonAgro.png` e `AmazonAgro.ico` são recursos
derivados; o ICO inclui 16, 24, 32, 48, 64, 128 e 256 px. Depois de substituir
o SVG por um ícone oficial, execute `packaging/resources/generate_icon.py` com
o Python do ambiente de build e reconstrua o Setup. O mesmo ICO é aplicado à
janela, barra de tarefas, EXE, Setup, Menu Iniciar, atalho opcional da Área de
Trabalho e entrada de Adicionar/Remover Programas.

O resolvedor usa o pacote em desenvolvimento e
`sys._MEIPASS/amazon_agro` no executável. O template permanece somente leitura
no bundle; alternativas configuradas pelo usuário continuam sendo respeitadas.
Não depende de `C:\Dev` ou do diretório corrente.

## SQLAlchemy em Python puro

O build fixa SQLAlchemy 2.1.1, constrói a partir do source distribution com
`DISABLE_SQLALCHEMY_CEXT=1` e recusa builds onde `HAS_CYEXTENSION` seja verdadeiro
ou existam `.pyd` dentro do pacote SQLAlchemy. Mantém os módulos Python `_cy`,
que implementam o fallback; não exclui módulos obrigatórios pelo nome.

Essa estratégia é prevista pela
[documentação do SQLAlchemy](https://docs.sqlalchemy.org/en/21/intro.html#installing-manually-from-the-source-distribution).
Elimina a dependência de extensões Cython opcionais. Não garante que políticas
corporativas aceitem um executável ou todas as demais DLLs sem assinatura.
Não é necessário nem recomendado alterar Defender, Smart App Control ou WDAC.

## Setup, atualização e dados do usuário

O `.iss` copia toda a distribuição, oferece atalho opcional na Área de Trabalho,
cria o Menu Iniciar e registra o desinstalador. Instala por usuário sem elevação
por padrão, em `%LOCALAPPDATA%\Programs\Amazon Agro Propostas`. O diálogo também
permite instalação para todos os usuários, em Program Files, mediante autorização
de administrador. Usa `{autopf}`, AppId estável e opções anteriores para atualizar
uma instalação existente. O mutex do aplicativo protege arquivos em uso.

Dados mutáveis permanecem em `%LOCALAPPDATA%\AmazonAgro`: configuração, bancos,
logs e exportações padrão. Não são criados dentro da pasta de instalação. O
desinstalador remove somente arquivos instalados e atalhos; não há regra de
exclusão dos dados do usuário. Excel, LibreOffice e Google Drive for Desktop
são dependências externas opcionais, não fazem parte do Setup. A pasta de Drive
pode ser configurada depois e não impede a primeira abertura.

## Testar a distribuição e a instalação

O diagnóstico usa o mesmo `amazon_agro.app.main`, abre a UI, conclui o wizard,
consulta um workbook **fictício**, salva/reabre uma proposta e clica nos botões
de exportação. As configurações e bancos são isolados em uma pasta nova de
evidência; dados reais do operador não são alterados.

```powershell
.\desktop\dist\AmazonAgroPropostas\AmazonAgroPropostas.exe --smoke-test "C:\Teste\evidencia-nova" --smoke-pdf
```

Para simular PDF indisponível, substitua `--smoke-pdf` por `--smoke-no-pdf`. O
XLSX continua sendo gerado e o diálogo de indisponibilidade é verificado. Um
smoke com `--smoke-pdf` gera PDF e ambos quando existe backend, ou registra
indisponibilidade. Confirme a quantidade de páginas com um leitor PDF; o smoke
verifica assinatura/cabeçalho PDF e configuração de uma página no XLSX.

Para instalar e testar pelo atalho real do Menu Iniciar, reinstalar com o mesmo
AppId, desinstalar e comparar hashes dos dados preservados:

```powershell
.\desktop\scripts\test_installer.ps1 -InstallerPath ".\desktop\installer-output\AmazonAgroPropostas-Setup-0.1.0.exe" -TestPdf
```

Esse teste faz uma instalação **real**, por usuário, e depois a desinstala. Por
segurança recusa executá-la sobre uma instalação já existente. Use uma conta
ou máquina de teste se já houver uma versão instalada. O teste lança o `.lnk`
criado no Menu Iniciar, com PATH sem Python/pip/py. Se falhar, preserva a
instalação para investigação. Não encerra processos Excel do usuário.

## Testar no segundo computador com App Control

1. Transfira somente Setup e SHA-256; confira se o hash corresponde ao publicado.
2. Execute o Setup e abra o atalho no Menu Iniciar.
3. Conclua o onboarding, deixando a fonte de imóveis opcional se necessário.
4. Crie uma proposta fictícia, salve, feche e reabra.
5. Gere Excel, abra o arquivo e confira os campos.
6. Se Excel ou LibreOffice estiver instalado, gere PDF e confira uma página.
7. Feche o programa, atualize/reinstale e confira que os dados continuam presentes.
8. Desinstale quando terminar o teste; confirme a preservação dos dados em LOCALAPPDATA.

Se houver bloqueio, registre horário, mensagem exata e nome/caminho do EXE ou
módulo bloqueado. Confira `startup-error.log` e `exports.log` em LOCALAPPDATA,
quando existirem. Uma equipe autorizada pode consultar o evento correspondente
de App Control/Code Integrity. Não altere a política para fazer o teste passar.
O segundo computador precisa ser testado localmente; o build não presume essa
aceitação a partir do resultado na máquina de desenvolvimento.

## Assinatura e SmartScreen

Este build não presume certificado Authenticode e pode ser distribuído sem
assinatura digital. Nome de publisher nos metadados não é assinatura. Windows
ou políticas corporativas podem avisar sobre aplicativo desconhecido ou bloquear
sua execução. Registre o comportamento; não contorne SmartScreen nem reduza
proteções.

Para distribuição ampla, obtenha um certificado de assinatura de código
confiável ou serviço de assinatura autorizado. A futura etapa de assinatura
deve assinar os binários próprios antes do Inno Setup, preservar assinaturas
de bibliotecas de terceiros, assinar o Setup final com timestamp e conferir
`Get-AuthenticodeSignature`. Gere o SHA-256 **após** assinar. Não use certificado
falso ou autoassinado para produção.

O histórico validado do Setup anterior está em `../STAGE5_VALIDATION.md`.
O estado do novo ícone, das correções visuais e do gate de execução está em
`../STAGE6_QA.md`. Scripts e checklists não substituem a validação real do
aplicativo instalado em uma máquina que permita executar o pacote atual.
