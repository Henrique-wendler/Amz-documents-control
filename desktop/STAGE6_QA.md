# Etapa 6A — QA visual e funcional do Amazon Agro Propostas

**Status em 05/10/2026: NÃO CONCLUÍDA; NO-GO para o novo pacote.** A correção visual e o ícone provisório estão no código, mas a política de Controle de Aplicativo deste Windows bloqueou o novo EXE não assinado antes do smoke. Por isso, o fluxo manual no aplicativo instalado e a geração de um novo Setup não puderam ser aceitos. As evidências da Etapa 5 continuam válidas somente para o Setup anterior.

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
