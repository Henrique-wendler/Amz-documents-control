"""Cells inspected in the supplied Modelo Proposta XLSX template."""

EXCEL_FIELD_MAP: dict[str, str] = {
    "numero_proposta": "A3",
    "agencia": "K3",
    "proponente": "A6",
    "cpf_cnpj": "D6",
    "outros_participantes": "F6",
    "tecnico": "I6",
    "porte": "K6",
    "finalidade": "A21",
    "descricao": "C21",
    "recursos_proprios_flag": "G21",
    "percentual_recursos_proprios": "H21",
    "fonte": "I21",
    "valor_total": "K21",
    "valor_fno": "A23",
    "fno_percentage": "D23",
    "astec_fno_financiada": "F23",
    "astec_fno_percentual": "H23",
    "laudo_abc_financiado": "I23",
    "laudo_abc_percentual": "K23",
    "laudo_abc_valor": "I25",
    "valor_of": "A25",
    "of_percentage": "D25",
    "astec_of_financiada": "F25",
    "astec_of_percentual": "H25",
    "technician_signature": "A34",
    "date_line": "A35",
}

PARTICIPANT_ROWS = tuple(range(9, 16))
PARTICIPANT_COLUMNS = ("A", "I", "M")
PROPERTY_ROWS = tuple(range(28, 32))
PROPERTY_COLUMNS = ("A", "E", "I", "K")
CLASSIFICATION_LEGEND_CELLS = {"1": "A32", "2": "E32", "3": "I32"}
PDF_PRINT_AREA = "A1:M35"

TEMPLATE_MARKERS = {
    "A2": "LOGO AMAZON",
    "C2": "PROPOSTA DE FINANCIAMENTO",
    "A7": "II - PARTICIPANTES",
    "A8": "NOME",
    "A19": "III - PROPOSTA",
    "A34": "TÉCNICO RESPONSÁVEL: <nome>",
    "A35": "<cidade>, <dia> de <mês> de <ano>",
}
