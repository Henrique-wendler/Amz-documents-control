# Etapa 5 — validação final em 05/10/2026

**Status: concluída neste computador.** O pacote ONEDIR, o executável empacotado, o Setup, a instalação, a exportação XLSX/PDF e a desinstalação passaram pelos testes reais. O Setup 0.1.0 permanece **NÃO ASSINADO**.

## Histórico e limite de distribuição

O primeiro computador bloqueou o executável não assinado por uma política de Controle de Aplicativo do Windows (eventos 3077 e 3033). Não se alterou essa política. Neste computador, a política permitiu executar o EXE e o instalador, tornando possível completar a validação. Isso não comprova que o Setup funcionará em máquinas que exigem publisher ou certificado confiável. Assinatura **Authenticode** dos binários próprios e do Setup é um requisito futuro para essas máquinas; não foi aplicada nesta versão. A assinatura local do Setup foi conferida como `NotSigned`.

## Evidências de empacotamento

| Verificação | Resultado |
|---|---|
| Build PyInstaller ONEDIR | Concluído; distribuição em `desktop/dist/AmazonAgroPropostas/` |
| Smoke do EXE empacotado | Aprovado; relatório em `desktop/build/smoke-onedir/report.json` |
| Instalador Inno Setup | Gerado: `desktop/installer-output/AmazonAgroPropostas-Setup-0.1.0.exe` |
| SHA-256 do Setup | `F4C9D01803459EFD5BC645BEF2437715864A4E4A6097B93ED2BAE4B6CAEE2AC7` — conferido novamente no arquivo local |
| Authenticode do Setup | `NotSigned` |

O smoke ONEDIR registrou `ok=true`, `frozen=true`, `xlsx_ok=true`, `pdf_ok=true`, `pdf_backends=["Excel COM"]`, `new_excel_processes_remaining=[]`, `template_unchanged=true` e `sqlite_integrity="ok"`. A importação do SQLAlchemy no pacote usa a variante Python pura; o aplicativo não depende de Python externo no PATH.

## Evidências da instalação

O script `desktop/scripts/test_installer.ps1` foi executado em instalação por usuário. O relatório está em `.tmp/stage5/install-20261005-144647/installation-report.json` e o smoke instalado em `.tmp/stage5/install-20261005-144647/installed-smoke/report.json`; esses artefatos de execução são ignorados pelo Git.

| Verificação | Resultado |
|---|---|
| Instalação e inicialização do aplicativo instalado | Aprovadas (`installed_ok=true`, `ok=true`, `frozen=true`) |
| Atalho real do Menu Iniciar | Aprovado (`start_menu_ok=true`) |
| XLSX pelo executável instalado | Aprovado (`xlsx_ok=true`) |
| PDF pelo executável instalado | Aprovado via Excel COM (`pdf_ok=true`, `pdf_backends=["Excel COM"]`) |
| Processos Excel novos remanescentes | Nenhum (`new_excel_processes_remaining=[]`) |
| Template empacotado | Sem alteração (`template_unchanged=true`) |
| SQLite instalado | Íntegro (`sqlite_integrity="ok"`) |
| Reinstalação com o mesmo AppId | Aprovada (`same_app_id_reinstall_ok=true`); não equivale a testar upgrade entre versões diferentes |
| Desinstalação | Aprovada (`uninstall_ok=true`) |
| LOCALAPPDATA | Preservado (`localappdata_preserved=true`); o teste também confirmou dados sintéticos preservados. Não havia arquivos reais do usuário no diretório antes ou depois desse teste. |

O relatório geral registra `ok=true`. A validação instalada foi feita com dados fictícios isolados, sem copiar planilhas reais de clientes para o pacote.

## Correção e regressão do script de build

Em `desktop/scripts/build_windows.ps1`, a consulta anterior de versão do SQLAlchemy por `python -c` perdia as aspas no PowerShell do Windows. A correção já aplicada invoca Python com uma string dupla do PowerShell e aspas simples dentro do código Python:

```powershell
$sqlalchemyVersion = (& $PythonPath -c "import importlib.metadata as metadata; print(metadata.version('SQLAlchemy'))").Trim()
```

O script verifica `LASTEXITCODE` e resultado vazio antes de reinstalar SQLAlchemy em Python puro. `desktop/tests/test_packaging.py` executa somente essa atribuição real extraída da AST do script em PowerShell e compara a versão devolvida com `importlib.metadata`; o teste não inicia PyInstaller, Inno Setup ou instalação. Na formalização da etapa, **256 testes passaram**, `npm run build` passou e `git diff --check` não apontou erros. O instalador **não foi reconstruído** nesta atualização documental.

## Encerramento

A Etapa 5 está aceita neste computador para empacotamento, instalação e exportação XLSX/PDF. Permanecem como trabalho futuro a assinatura Authenticode para ambientes restritivos e, se necessário, a validação de upgrade entre versões diferentes. O bloqueio histórico do primeiro computador continua documentado como limite de distribuição do Setup não assinado.
