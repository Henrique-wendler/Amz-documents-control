# Correção final — Laudo ABC exclusivo do FNO e percentuais ASTEC

Data: 07/10/2026. HEAD preservado: `2d44f6b1d29705330bed303e0a689fde08190f93`. Branch: `feature/desktop-proposal-generator`.
Esta decisão final substitui as orientações anteriores conflitantes. Não houve commit, push, Setup ou RC.

## Regras verificadas

- ABC: `valor_fno * laudo_abc_percentual / 100`, com Decimal e arredondamento somente na apresentação.
- Total 100.000 / FNO 70.000 / OF 30.000 / ABC 5% → **R$ 3.500,00**.
- Alterar FNO para 80.000 → **R$ 4.000,00** imediatamente.
- Alterar apenas Total para 120.000, mantendo FNO 70.000 → **R$ 3.500,00**, sem mudança.
- ABC fica no card FNO, com percentual editável e valor automático somente leitura. Em Não, campos ocultos/desabilitados e omitidos no documento.
- ASTEC FNO e ASTEC OF são independentes: Sim revela o percentual editável; Não oculta/desabilita e omite o percentual na exportação. Escolhas e percentuais persistem ao salvar/reabrir, inclusive após alternar para Não. Percentuais inativos antigos continuam compatíveis.
- CLASS. DA % permanece a participação automática de cada fonte sobre Total, somente leitura: **FNO 70,00% / OF 30,00%** no exemplo oficial. Total zero não divide por zero.
- Recursos Próprios mantém Sim/Não + percentual. Não há input monetário de recursos próprios.
- Valores financeiros incompatíveis podem ser salvos como proposta parcial; exportação permanece bloqueada com mensagem contextual.

## Interface e documento

A página agrupa Descrição e Valor Total, FNO (valor, participação, ASTEC + percentual, ABC + percentual e valor automático), OF (valor, participação, ASTEC + percentual) e Recursos próprios. Cabeçalho, marca, navegação, resumo recolhível e ícone da etapa anterior permanecem.

Na cópia XLSX, `H23` apresenta % ASTEC FNO somente em Sim; `H25`, % ASTEC OF somente em Sim. `I25` usa o ABC derivado do FNO e o título **VALOR LAUDO ABC — SOMENTE FNO** identifica sua fonte, junto ao percentual **% LAUDO ABC (FNO)**. O PDF via Excel COM usa essa mesma planilha preenchida. Original do template não foi modificado.

A primeira suíte completa registrou 398 PASS e três falhas de paginação: aumentar as alturas dos cabeçalhos financeiros fazia a data transbordar para uma página extra em propostas com 5/8/9 matrículas. As alturas originais foram restauradas e os rótulos ASTEC foram adaptados nas células divididas. Não foi alterado o algoritmo de paginação nem o conversor PDF. Após a correção, a suíte completa foi repetida com sucesso.

O PDF de prova com cinco matrículas foi convertido via Excel COM, renderizado e inspecionado visualmente: logo, tabelas, bordas, alinhamentos, percentuais ASTEC, ABC R$ 3.500,00 exclusivo do FNO, quatro matrículas na primeira página e continuação na segunda. As screenshots são renderizações da janela Qt com dados fictícios; não representam QA manual do aplicativo instalado.

## Execução final

| Gate | Resultado |
| --- | --- |
| pytest completo | **401 PASS**, zero falhas/erros/skips |
| Regressões anteriores | 381 casos preservados com expectativas antigas ABC corrigidas; 20 casos adicionais; todos os 355 IDs do baseline presentes |
| npm run build | PASS; aviso existente sobre bundle >500 kB |
| git diff --check | PASS |
| Source smoke | PASS, frozen=false, salvar/reabrir PASS |
| ABC | Base FNO, reatividade, independência do Total, persistência e exportação PASS |
| ASTEC FNO/OF | Sim/Não independentes, percentuais editáveis/condicionais, persistência, revisão e exportação PASS |
| CLASS. DA FNO/OF | Automática e somente leitura, 70,00% / 30,00%, PASS |
| XLSX | PASS; template original inalterado |
| PDF | PASS real via Excel COM; nenhum processo Excel novo restante |
| Paginação nativa | 1/4/5/8/9 matrículas → 1/1/2/2/3 páginas |
| Drive/catalog | PASS; leitura local sem write-back; José Luiz BASA Ambiental/OK, 9 fazendas / 12 matrículas / 4 proprietários, zero avisos |
| Arquivo de origem | SHA-256 igual antes/depois; segunda atualização UNCHANGED |
| SQLite | integrity_check=ok; foreign_key_check sem erros |
| UI | 1366×768 e 1920×1080 PASS, sem rolagem horizontal; rolagem vertical mantém campos alcançáveis |
| Amazon Agro | Nome/CNPJ oficiais e tipo 1 preservados, editável/removível |
| Setup anterior | SHA-256 idêntico; nenhum packaging nesta etapa |

## Evidências locais, ignoradas pelo Git

- Suíte final: `../tmp/fno-abc-correction-20261007/pytest-final-results.xml`
- Smoke fonte: `../tmp/fno-abc-correction-20261007/source-smoke/report.json`
- Catálogo real somente leitura: `../tmp/fno-abc-correction-20261007/real-source-validation.json`
- Geometria/screenshots: `../tmp/fno-abc-correction-20261007/ui-preview-report.json`
- PDF inspecionado: `../tmp/fno-abc-correction-20261007/layout-proof.pdf`
- Renderização PDF: `../tmp/fno-abc-correction-20261007/layout-proof-page.png`
- Git status: `../tmp/fno-abc-correction-20261007/git-status-final.txt`

## Screenshots da página Proposta

- [Página / Total — 1366×768](../tmp/fno-abc-correction-20261007/screenshots/proposal-1366x768.png)
- [FNO / ASTEC / ABC R$ 3.500,00 — 1366×768](../tmp/fno-abc-correction-20261007/screenshots/proposal-fno-1366x768.png)
- [OF / ASTEC / Recursos próprios — 1366×768](../tmp/fno-abc-correction-20261007/screenshots/proposal-of-1366x768.png)
- [FNO e OF — 1920×1080](../tmp/fno-abc-correction-20261007/screenshots/proposal-1920x1080.png)
- [ASTEC e ABC Não: percentuais ocultos](../tmp/fno-abc-correction-20261007/screenshots/proposal-abc-astec-no-1366x768.png)
- [Resumo recolhido](../tmp/fno-abc-correction-20261007/screenshots/proposal-summary-collapsed-1366x768.png)
- [Composição financeira inválida](../tmp/fno-abc-correction-20261007/screenshots/proposal-financial-error-1366x768.png)

## Git status final

```text
 M desktop/BUSINESS_RULES_VALIDATION.md
 M desktop/README.md
 M desktop/src/amazon_agro/app/smoke.py
 M desktop/src/amazon_agro/domain/models.py
 M desktop/src/amazon_agro/exporters/excel.py
 M desktop/src/amazon_agro/exporters/excel_layout.py
 M desktop/src/amazon_agro/exporters/excel_map.py
 M desktop/src/amazon_agro/repositories/sqlite_proposals.py
 M desktop/src/amazon_agro/services/export_validator.py
 M desktop/src/amazon_agro/ui/main_window.py
 M desktop/src/amazon_agro/ui/pages.py
 M desktop/src/amazon_agro/ui/review.py
 M desktop/src/amazon_agro/ui/summary.py
 M desktop/src/amazon_agro/ui/theme.py
 M desktop/tests/test_excel_export.py
 M desktop/tests/test_hotfix_finalization.py
 M desktop/tests/test_hotfix_qa.py
?? desktop/PROPOSAL_UI_VALIDATION.md
?? desktop/src/amazon_agro/ui/boolean_choice.py
?? desktop/tests/test_proposal_refresh.py
```

Nenhum arquivo staged. As alterações locais da etapa anterior foram preservadas e corrigidas conforme a decisão final. Parser BASA, catálogo/Drive local, templates originais, recursos da marca, conversor PDF, paginação e instalador não foram modificados. A adaptação do layout financeiro ocorre somente na cópia XLSX exportada.
