# Etapa 6A — QA visual e funcional do Amazon Agro Propostas

**Estado após a Etapa 6B em 05/10/2026: RC não assinada gerada; PACKAGE QA = BLOCKED/PENDING; NO-GO para piloto.** A seção 6A abaixo preserva o resultado histórico daquela tentativa, quando App Control bloqueou o EXE. A seção 6B no fim do documento registra o build e smoke posteriores. Nenhuma execução instalada da RC foi aceita.

## Ambiente e versão

- Windows 11 x64; Python 3.12/PySide6; projeto na versão `0.1.0`.
- Commit base: `83652ce` (`feature/desktop-proposal-generator`), com alterações da Etapa 6A ainda não commitadas.
- Testes usam dados fictícios. As capturas de diagnóstico foram renderizadas com Qt `offscreen` e não representam execução instalada.
- O Setup existente em `desktop/installer-output/AmazonAgroPropostas-Setup-0.1.0.exe` **não foi substituído**. Seu SHA-256 permanece `F4C9D01803459EFD5BC645BEF2437715864A4E4A6097B93ED2BAE4B6CAEE2AC7`.

## Checklist e casos

São **19 itens**, dos quais **12 foram executados: 11 PASS, 1 FAIL**. Outros **7 ficaram bloqueados**. PASS em diagnóstico estático ou renderização local não equivale a aprovação do aplicativo instalado.

| Caso | Verificação | Resultado | Evidência ou limite |
|---|---|---|---|
| QA-01 | Contraste de Configurações > Geral | PASS (código/renderização) | QSS centralizado; fundo claro e teste de pixel |
| QA-02 | Contraste de Configurações > Imóveis | PASS (código/renderização) | Fundo claro, formulário em linhas e sem barra horizontal externa |
| QA-03 | Resumo, navegação e status dinâmico | PASS (automatizado) | Seções Identificação/Operação/Itens/Status e teste de atualização imediata |
| QA-04 | Layout em 1366×768 e 1920×1080 | PASS (diagnóstico `offscreen`) | Capturas geradas; confirmação visual instalada pendente |
| QA-05 | SVG, PNG e ICO provisórios | PASS | ICO verificado com 16, 24, 32, 48, 64, 128 e 256 px |
| QA-06 | Referências de ícone no código, EXE e Inno Setup | PASS (estático) | Janela, spec, Setup, atalhos e entrada de desinstalação; aparência instalada pendente |
| QA-07 | Suíte `pytest` | PASS | **259 passed**; os 256 anteriores foram preservados |
| QA-08 | `npm run build` | PASS | Vite compilou; aviso existente de chunk grande |
| QA-09 | `git diff --check` | PASS | Sem erros de whitespace |
| QA-10 | PyInstaller ONEDIR do código final | PASS | Em `.tmp/stage6a/final-dist/AmazonAgroPropostas/` |
| QA-11 | Auditoria da distribuição final | PASS | 267 arquivos; template original sem alteração |
| QA-12 | Smoke do novo EXE congelado | **FAIL** | `Start-Process`: “Uma política de Controle de Aplicativo bloqueou este arquivo.” |
| QA-13 | Fluxo manual instalado: preencher, salvar, fechar, reabrir, editar | BLOQUEADO | Novo EXE não iniciou; execução Python não foi usada como substituto |
| QA-14 | XLSX manual instalado, abrir arquivo/pasta, conferir Excel | BLOQUEADO | Sem aplicativo instalado da nova versão |
| QA-15 | PDF manual instalado via Excel COM e conferir uma página | BLOQUEADO | Sem aplicativo instalado da nova versão |
| QA-16 | Gerar Excel + PDF, atomicidade e colisão de nome | BLOQUEADO | Sem aplicativo instalado da nova versão |
| QA-17 | Pasta local do Google Drive for Desktop e catálogo na interface | BLOQUEADO | Sem aplicativo instalado da nova versão |
| QA-18 | Screenshots finais do aplicativo instalado e diálogo de sucesso | BLOQUEADO | Somente capturas `offscreen` de diagnóstico disponíveis |
| QA-19 | Novo Setup 0.1.0 e novo SHA-256 | BLOQUEADO | O gate de smoke falhou; nenhum Setup novo foi publicado |

As capturas de diagnóstico estão em `.tmp/stage6a/visual-check/`: `operacao-1366x768.png`, `operacao-1920x1080.png`, `operacao.png`, `participantes.png`, `proposta.png`, `imoveis.png`, `revisao.png`, `config-geral.png`, `config-imoveis.png` e `onboarding.png`. O plugin Qt `offscreen` desta máquina substituiu caracteres por quadrados; essas imagens servem para verificar geometria e cores, **não** legibilidade final. Não há captura de diálogo de sucesso XLSX/PDF da nova versão.

## Alterações e revalidação

- O tema QSS compartilhado agora define fundo claro para páginas, conteúdo e abas, além de cores de texto, foco, botões e cartões. A correção remove a região central escura com texto escuro observada em Configurações.
- A tela principal recebeu ajustes locais de margens, proporções, títulos, estados da navegação e posição do comando de recolher resumo. O painel lateral separa Identificação, Operação, Itens e Status; usa as mesmas regras do `ProposalExportValidator`.
- As barras horizontais desnecessárias da navegação e da aba Imóveis foram removidas. O scroll vertical permanece disponível.
- O ícone provisório combina folha/broto e documento. `AmazonAgro.svg` é a fonte; `AmazonAgro.png` e `AmazonAgro.ico` são derivados. O `.spec` incorpora o ICO no EXE e nos recursos internos, o app define o ícone da janela, e o Inno o referencia para Setup/atalhos/Adicionar ou Remover Programas. A aparência real desses pontos aguarda instalação do novo pacote. Um ícone oficial poderá substituir o recurso sem alterar a arquitetura.
- Testes de regressão cobrem contraste das duas abas, seções/status do resumo e estrutura/tamanhos do ICO. A suíte completa passou após as mudanças finais.
- A tentativa do script padrão `build_windows.ps1` foi interrompida ao limpar um diretório temporário antigo `desktop/build/pytest` sem permissão de remoção. O empacotamento e a auditoria foram executados em `.tmp/stage6a/`, sem modificar o script. Esse bloqueio de limpeza é de ambiente, não de dados do aplicativo.
- O executável final está **NotSigned**. O smoke foi tentado uma vez após o empacotamento final e repetiu o bloqueio de App Control. A política não foi alterada nem contornada.

## XLSX, PDF, dados e decisões pendentes

O Setup anterior da Etapa 5 passou em instalação, Menu Iniciar, XLSX, PDF via Excel COM, reinstalação, desinstalação e preservação de `LOCALAPPDATA` (`STAGE5_VALIDATION.md`). Esses resultados **não certificam** o novo código visual. No diagnóstico prévio de leitura BASA, os três arquivos disponíveis produziram 3 fazendas/10 matrículas, 3/9 e 4/13, sem alterar os arquivos; a nova interface instalada não foi testada contra eles. Não houve escrita em arquivos sincronizados do Drive.

Continuam `BUSINESS_DECISION_PENDING`: várias matrículas no documento final; limite de quatro linhas de imóvel; classificação 1 (Hipoteca ou Garantia); inclusão automática da Amazon Agro como participante; tipo/código da Amazon Agro; obrigatoriedade por banco; identidade após renomeação ou movimentação extrema das fontes. Nenhuma regra foi inventada nesta etapa.

## Achados e recomendação

| Achado | Severidade | Estado |
|---|---|---|
| Novo EXE não assinado bloqueado por App Control, impedindo QA instalado e novo Setup validado | **BLOCKER de ambiente/distribuição** | Aberto; requer assinatura confiável ou validação em máquina permissiva autorizada |
| Configurações com fundo escuro e texto escuro | MEDIUM | Corrigido no QSS; regressão automatizada passou; instalação pendente |
| Barras horizontais desnecessárias | LOW | Corrigido; verificação de layout `offscreen` passou |
| Diretório antigo de build com acesso de remoção negado | MEDIUM de infraestrutura | Aberto; build isolado e auditado funcionou, script padrão continua bloqueado nesse diretório |

**NO-GO para piloto do novo pacote da Etapa 6A.** Faltam smoke do EXE, Setup reconstruído, instalação e fluxo manual completo da versão alterada. O Setup anterior continua não assinado e não contém estas correções. Máquinas que exigem publisher/certificado confiável permanecem fora da aceitação até assinatura Authenticode; não se deve desativar a política para obter um resultado positivo.

## Etapa 6B — release candidate não assinada

O modo explícito `-AllowUnsignedRcWhenSmokeBlocked` mantém o gate normal sem a flag. Ele permite seguir ao Inno Setup **somente** quando `Start-Process` não devolve processo e a exceção contém evidência específica de bloqueio por política. Nesse caso registra `SMOKE_BLOCKED_BY_POLICY` e tenta coletar eventos Code Integrity 3033/3077 quando disponíveis. Crash, erro de importação, Qt, template, SQLAlchemy, timeout e relatório de smoke inválido continuam falhando. O teste de regressão exercita as duas rotas e um erro comum.

O build RC utiliza uma pasta exclusiva em `desktop/.build-work/`, dentro do projeto, sem limpar o `desktop/build/pytest` antigo nem remover o Setup validado anterior. No primeiro ensaio, um teste de substituição de arquivo temporário teve `WinError 5` nessa pasta; a repetição em outra pasta isolada passou integralmente. Classificação: **MEDIUM de infraestrutura, mitigado por isolamento, com uma falha transitória ainda a observar**. Não houve alteração de permissões ou exclusão de diretórios do usuário.

| Verificação do primeiro build 6B, antes do commit | Resultado histórico |
|---|---|
| `pytest` | **264 passed**; 259 anteriores preservados e cinco testes de release adicionados |
| `npm run build` | PASS |
| `git diff --check` | PASS |
| PyInstaller ONEDIR | PASS |
| Auditoria estática | PASS; 222 arquivos, template inalterado, sem dados reais no pacote |
| Ícone | Presente no recurso empacotado; spec, Inno, janela e atalhos verificados estaticamente. Aparência instalada pendente. |
| Smoke do EXE desta execução | **PASS**: `ok=true`, `frozen=true`, `xlsx_ok=true`, `pdf_ok=true`, backend `Excel COM`, nenhum processo Excel novo remanescente, SQLite íntegro |
| Bloqueio anterior por App Control | Permanece documentado: `Start-Process` informou “Uma política de Controle de Aplicativo bloqueou este arquivo.” Nenhuma proteção foi alterada. |
| Setup RC | Gerado; `AmazonAgroPropostas-Setup-0.1.0-unsigned-rc.exe`, **39.452.435 bytes** |
| SHA-256 da RC anterior ao commit | `5599AF5913E7CBB5F622EF854D26037AF47BFA9C7F7CFCEA26B34C3449D24527` |
| Authenticode | EXE e Setup RC: `NotSigned` |
| Manifesto | `AmazonAgroPropostas-Setup-0.1.0-unsigned-rc.manifest.json` com `release_type=UNSIGNED_RC`, `signed=false`, `smoke_status=PASS`, 264 testes, build/auditoria PASS, commit base, SHA e horário |
| Setup anterior | Preservado com SHA-256 `F4C9D01803459EFD5BC645BEF2437715864A4E4A6097B93ED2BAE4B6CAEE2AC7` |

O manifesto daquele build registra `smoke_status=PASS` porque **a tentativa final realmente passou**. Não se substituiu esse fato pelo bloqueio da tentativa anterior. O campo `git_commit` identifica o commit base `c4104a7c77bd6981024dc54842554a6168597c83`; as alterações 6B estavam não commitadas no momento do build. Esse artefato fica registrado apenas como evidência histórica e deve ser substituído pelo build do HEAD limpo antes do QA externo.

### Consolidação Git antes do QA externo

A Etapa 6A já foi commitada em `c4104a7c77bd6981024dc54842554a6168597c83`. A consolidação 6B inclui somente `.gitignore`, este relatório, `packaging/AmazonAgroPropostas.iss`, `packaging/README.md`, `packaging/UNSIGNED_RC_QA.md`, `scripts/build_windows.ps1` e `tests/test_release_rc.py`. Build, distribuição, instaladores, bancos, planilhas reais, logs e dados pessoais permanecem fora do commit. O template do aplicativo já versionado não foi alterado.

O procedimento de entrega exige reexecutar os testes, `npm run build` e `git diff --check`, fazer o commit local, confirmar `git status --porcelain` vazio e reconstruir a RC desse HEAD. O novo `.manifest.json` e o `.exe.sha256`, gerados fora do Git, são a referência da entrega: o `git_commit` deve corresponder exatamente ao HEAD usado e o SHA-256 deve corresponder ao novo Setup. Para esta entrega, os valores exigidos são `release_type=UNSIGNED_RC`, `signed=false` e `smoke_status=PASS`. O commit completo e o novo hash são informados junto aos artefatos, sem editar arquivos versionados depois do build. Não há push nesta consolidação.

**PACKAGE QA = BLOCKED/PENDING.** A RC ainda precisa ser instalada e testada manualmente em outro Windows permissivo, conforme [roteiro de QA externo](packaging/UNSIGNED_RC_QA.md). Permanecem pendentes aparência real do ícone e Configurações, salvar/fechar/reabrir/editar, XLSX, PDF, ambos, pasta local do Google Drive for Desktop, reinstalação, desinstalação e preservação de `LOCALAPPDATA`. O smoke e o Setup não transformam os casos manuais bloqueados da 6A em PASS. **NO-GO para piloto** até essas verificações e a ausência de defeitos BLOCKER/HIGH.
