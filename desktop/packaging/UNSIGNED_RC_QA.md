# Roteiro de QA externo — RC não assinada 0.1.0

Execute em um Windows de teste **autorizado a rodar software não assinado**. Não altere App Control, Defender, WDAC ou Smart App Control. Use apenas dados fictícios na proposta; planilhas BASA reais, se necessárias, devem permanecer somente leitura. Registre PASS/FAIL e a mensagem exata de qualquer falha. A RC não está aprovada para piloto.

| Nº | Ação e evidência esperada | Resultado |
|---|---|---|
| 1 | Comparar SHA-256 do Setup com o arquivo `.sha256` e o `.manifest.json`. | Pendente |
| 2 | Instalar `AmazonAgroPropostas-Setup-0.1.0-unsigned-rc.exe` por usuário. | Pendente |
| 3 | Conferir novo ícone no Setup, EXE, Menu Iniciar, janela, barra de tarefas, Área de Trabalho (se criada) e Adicionar/Remover Programas. | Pendente |
| 4 | Abrir Configurações > Geral e Imóveis; confirmar fundo claro, textos legíveis, botões e abas consistentes. | Pendente |
| 5 | Criar proposta fictícia e preencher Operação, Participantes, Proposta, Imóveis e Revisão. | Pendente |
| 6 | Salvar e confirmar ID, resumo e status sem erro. | Pendente |
| 7 | Fechar completamente o aplicativo. | Pendente |
| 8 | Abrir novamente pelo atalho do Menu Iniciar. | Pendente |
| 9 | Usar **Abrir**, selecionar a proposta e conferir todos os campos, imóvel e snapshots. | Pendente |
| 10 | Editar ao menos dois campos e salvar. | Pendente |
| 11 | Fechar, reabrir e conferir as alterações persistidas. | Pendente |
| 12 | Gerar XLSX; abrir arquivo e pasta, conferir dados e uma página configurada. | Pendente |
| 13 | Gerar PDF via Excel COM; abrir, conferir uma página e ausência de Excel novo remanescente. | Pendente |
| 14 | Gerar Excel + PDF; conferir os dois arquivos e ausência de resultado parcial. | Pendente |
| 15 | Configurar uma pasta local sincronizada pelo Google Drive for Desktop, sem API Google. | Pendente |
| 16 | Atualizar catálogo e buscar uma fazenda e matrícula; conferir proprietário e município/UF local sem alterar XLSX de origem. | Pendente |
| 17 | Fechar e reabrir; confirmar catálogo e proposta preservados. | Pendente |
| 18 | Reinstalar a RC com o mesmo AppId. | Pendente |
| 19 | Confirmar proposta e configurações preservadas após reinstalação. | Pendente |
| 20 | Desinstalar e confirmar remoção do programa e atalhos. | Pendente |
| 21 | Confirmar preservação de `LOCALAPPDATA\AmazonAgro` após desinstalação. | Pendente |

Anexe evidência dos resultados e screenshots sem dados pessoais reais. Um FAIL em salvar/reabrir, XLSX, PDF, integridade do catálogo ou preservação de dados impede GO para piloto.
