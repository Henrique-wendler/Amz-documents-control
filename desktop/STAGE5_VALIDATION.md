# Etapa 5 — validação em 01/10/2026

**Etapa incompleta: App Control bloqueou a execução do EXE não assinado.**
O usuário confirmou que ainda não dispõe de certificado ou serviço de assinatura.
Não foram alteradas políticas de segurança. O Setup não foi produzido porque
o prompt exige smoke do EXE aprovado antes de criar o instalador.

## Evidências e resultados

| Item solicitado | Resultado observado |
|---|---|
| Etapa 4 commitada | `de50f87` — `feat(desktop): improve proposal workflow and export UX`; árvore inicialmente limpa |
| Testes | 237 existentes preservados; **255 aprovados**, incluindo 18 de empacotamento; execução final 27,92 s |
| Frontend | `npm run build` aprovado; aviso existente de chunk acima de 500 kB; nenhum código React alterado |
| PyInstaller | **6.22.3**, hooks **2026.8**, Python **3.12.10 x64** |
| Inno Setup | **6.7.3**; `.iss` validado com saída desativada (`/O-`), exit 0; nenhum Setup criado |
| Onedir | `desktop/dist/AmazonAgroPropostas/` |
| EXE | `desktop/dist/AmazonAgroPropostas/AmazonAgroPropostas.exe` |
| Installer | Não gerado; caminho previsto: `desktop/installer-output/AmazonAgroPropostas-Setup-0.1.0.exe` |
| Tamanho | Distribuição onedir: **121,19 MiB**, **221 arquivos**; tamanho instalado ainda não medido |
| SHA-256 do installer | Indisponível: installer não gerado |
| Smoke do EXE final | Bloqueado pelo Windows antes de iniciar, com PATH apenas System32 e CWD fora do projeto |
| XLSX pelo EXE | Não validado; smoke em código-fonte passou, mas não substitui a validação congelada |
| PDF pelo EXE | Não validado; fechamento do Excel e quantidade de páginas precisam ser medidos no EXE |
| Instalação por Setup | Não executada |
| Menu Iniciar | Não executado; script preparado para lançar o `.lnk` real instalado |
| Reinstalação/upgrade | AppId estável e script preparados; teste ainda não executado; reinstalar mesma versão não equivale a upgrade entre versões |
| Desinstalador | Não executado; nenhuma regra de exclusão de LOCALAPPDATA no `.iss` |
| Preservação de LOCALAPPDATA | Nenhum teste de instalação/desinstalação alterou dados; preservação após desinstalação ainda não validada |
| Privacidade | Auditoria aprovada: somente template autorizado, sem workbooks reais, bancos, logs, config pessoal ou `direct_url.json` |
| Template | Hash da cópia empacotada idêntico ao original; recurso somente leitura dentro do bundle |
| SQLAlchemy | **2.1.1 em Python puro**; sem `.pyd`/DLL opcionais SQLAlchemy no pacote |
| App Control | `Start-Process` retornou “Uma política de Controle de Aplicativo bloqueou este arquivo”; eventos **3077 e 3033**, exigência de assinatura; EXE `NotSigned` |
| SmartScreen | Não testado; não confundir com o bloqueio de Code Integrity observado |
| Segundo computador | Pendente; roteiro em `packaging/README.md` |
| Ícone | Nenhum `.ico` oficial aprovado encontrado; mecanismo pronto, marca preservada |

SHA-256 do **EXE**, não do installer:

`77e528e44172c5a0d1101c478e862f2a0120be1bd0e18ccda376bda826020aa6`

Manifesto completo com tamanho e hash de cada arquivo:
`desktop/build/distribution-manifest.json` (artefato ignorado pelo Git).

## Diagnóstico do empacotamento

A primeira distribuição falhou no import de QtCore. A análise dos arquivos
coletados identificou `icuuc.dll` do Poppler do ambiente de ferramentas, em vez
da dependência resolvida pelo Windows. O build agora restringe PATH ao System32
durante o PyInstaller; a distribuição final não contém esse ICU externo.
O spec inclui o conjunto MSVC app-local fornecido pelo wheel PySide6, para
manter runtimes compatíveis. A correção da coleta foi confirmada no manifesto;
a inicialização após essa correção **não pôde ser confirmada** pelo bloqueio de
App Control. Nenhum componente do Windows foi substituído.

O smoke real em código-fonte concluiu onboarding, persistência, catálogo local
fictício, salvar/reabrir, XLSX e mensagem de PDF indisponível. Os 255 testes
passaram também no ambiente de build. Isso não prova funcionamento instalado.

## Arquivos e estrutura

Alterados: `.gitignore`, `README.md`, `pyproject.toml`, `app/main.py`,
`config/settings.py` dentro de `desktop`.

Criados dentro de `desktop`:

- `src/amazon_agro/version.py`: identidade e versão central `0.1.0`.
- `src/amazon_agro/config/resources.py`: recursos em desenvolvimento e `_MEIPASS`.
- `src/amazon_agro/app/smoke.py`: diagnóstico opt-in com dados fictícios isolados.
- `packaging/entrypoint.py`: inicia o mesmo `amazon_agro.app.main`, com log de falha precoce.
- `packaging/AmazonAgroPropostas.spec`: Analysis → PYZ → EXE → COLLECT; onedir, sem UPX, Qt/pywin32/SQLite/openpyxl, metadata, template e ícone opcional; recusa SQLAlchemy nativo.
- `packaging/AmazonAgroPropostas.iss`: Setup, Languages, Tasks, Files, Icons e Run; identidade recebida da versão central, AppId estável, instalação por usuário ou todos, atalhos e desinstalador.
- `scripts/build_windows.ps1`: ambiente isolado, testes, freeze, auditoria, smoke, Inno e SHA-256; interrompe quando smoke falha.
- `scripts/package_support.py`: versão, validação do ambiente e manifesto de distribuição.
- `scripts/test_installer.ps1`: instalação real, atalho Menu Iniciar, smoke, reinstalação, desinstalação e comparação de hashes de dados; ainda não executado.
- `tests/test_packaging.py`: 18 testes portáveis, sem exigir Inno ou Office em CI.
- `packaging/README.md` e este relatório: build, instalação, segurança e aceitação.

Distribuição, ambiente de build e ferramentas baixadas são artefatos ignorados;
nenhum binário foi adicionado ao Git. Nenhum commit anterior foi reescrito.

## Continuidade necessária

1. Disponibilizar assinatura de código confiável/autorizada, aceita pela política
   da máquina, e integrar assinatura dos binários próprios antes do smoke e do
   Setup. Não desativar proteções nem usar certificado falso/autoassinado de produção.
2. Reexecutar o build e corrigir quaisquer falhas adicionais reveladas pelo smoke.
3. Confirmar XLSX e PDF pelo EXE, PDF de uma página e ausência de novos processos Excel.
4. Gerar Setup e seu SHA-256; executar `test_installer.ps1` em conta/máquina de teste.
5. Confirmar Menu Iniciar, onboarding, proposta, pasta local sincronizada e
   preservação dos dados após reinstalação/desinstalação.
6. No segundo computador, transferir Setup e hash, instalar e seguir o roteiro
   de `packaging/README.md`; registrar qualquer bloqueio sem mudar políticas.

Excel, LibreOffice e Google Drive for Desktop não foram incluídos. Configuração
alternativa de template e armazenamento em LOCALAPPDATA foram preservados.
