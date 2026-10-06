"""Printable table layout adapted from the approved Word reference.

Only the loaded output workbook is styled; the technical template stays intact.
"""
from openpyxl.drawing.image import Image
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.page import PageMargins
from openpyxl.worksheet.properties import PageSetupProperties

from amazon_agro.config.resources import resource_path


LOGO_RESOURCE = ("resources", "AmazonAgroLogo.png")
LOGO_WIDTH = 360


def add_logo(sheet, row=1):
    logo = Image(resource_path(*LOGO_RESOURCE))
    logo.height = LOGO_WIDTH * logo.height / logo.width
    logo.width = LOGO_WIDTH
    sheet.add_image(logo, f"A{row}")


def prepare_layout(sheet):
    # Keep the original sections and four property rows, replacing only obsolete
    # financing percentages and the logo placeholder in the generated copy.
    for region in ("A2:B3", "J22:L22", "J23:L23", "J24:L24", "J25:L25"):
        sheet.unmerge_cells(region)
    for row in range(22, 26):
        for column in range(9, 14):
            sheet.cell(row, column).value = None
    for region in ("A2:B2", "A3:B3", "C21:F21", "F23:H23", "I22:J22", "K22:M22",
                   "I23:J23", "K23:M23", "I24:M24", "I25:M25"):
        sheet.merge_cells(region)
    sheet["A2"] = "Nº DA PROPOSTA"
    sheet["A3"] = None
    sheet["K2"] = "AGÊNCIA"
    sheet["M8"] = "TIPO"
    sheet["F22"] = "ASTEC FNO FINANCIADA?"
    sheet["D22"] = "PARTICIPAÇÃO FNO"
    sheet["D24"] = "PARTICIPAÇÃO OF"
    sheet["F24"] = "ASTEC OF FINANCIADA?"
    sheet["I22"] = "LAUDO ABC FINANCIADO?"
    sheet["K22"] = "% LAUDO ABC"
    sheet["I24"] = "VALOR LAUDO ABC"
    sheet["I17"] = "8 - OUTORGA CONJUGAL"

    widths = (7, 7, 7, 8, 8, 6, 7, 8, 8, 6, 6, 7, 4)
    for column, width in zip("ABCDEFGHIJKLM", widths, strict=True):
        sheet.column_dimensions[column].width = width
    heights = {
        1: 60, 2: 16, 3: 16, 4: 17, 5: 23, 6: 34, 7: 17, 8: 18,
        **{row: 19 for row in range(9, 16)},
        **{row: 15 for row in range(16, 19)},
        19: 17, 20: 34, 21: 34, 22: 26, 23: 23, 24: 23, 25: 23,
        26: 17, 27: 22, **{row: 27 for row in range(28, 32)},
        32: 22, 33: 5, 34: 24, 35: 26,
    }
    line = Side(style="thin", color="000000")
    border = Border(left=line, right=line, top=line, bottom=line)
    headers = {2, 4, 5, 7, 8, 19, 20, 22, 24, 26, 27, 32}
    sections = {4, 7, 19, 26}
    legends = {16, 17, 18, 32}
    for row in sheet.iter_rows(min_row=1, max_row=35, max_col=13):
        number = row[0].row
        sheet.row_dimensions[number].height = heights[number]
        for cell in row:
            cell.font = Font(name="Times New Roman", size=8.5 if number in legends else 10,
                             bold=number in headers)
            cell.fill = PatternFill()
            cell.border = border if 2 <= number <= 32 or number == 34 else Border()
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    for row in range(9, 16):
        sheet[f"A{row}"].alignment = Alignment(horizontal="left", vertical="center", indent=1, wrap_text=True)
        sheet[f"M{row}"].font = Font(name="Times New Roman", size=10, bold=True)
    for row in sections:
        sheet[f"A{row}"].font = Font(name="Times New Roman", size=11, bold=True)
    sheet["C2"].font = Font(name="Times New Roman", size=11, bold=True)
    sheet["A2"].font = Font(name="Times New Roman", size=9, bold=True)
    sheet["A2"].alignment = Alignment(horizontal="center", vertical="center", shrinkToFit=True)
    sheet["A3"].alignment = Alignment(horizontal="center", vertical="center", shrinkToFit=True)
    sheet["M8"].font = Font(name="Times New Roman", size=8, bold=True)
    sheet["A34"].font = Font(name="Times New Roman", size=10, bold=True)
    sheet["A34"].alignment = Alignment(horizontal="left", vertical="center", indent=1, wrap_text=True)
    sheet["A35"].font = Font(name="Times New Roman", size=11)
    sheet["A35"].alignment = Alignment(horizontal="left", vertical="center", indent=1)
    sheet.sheet_view.showGridLines = False
    sheet.print_options.horizontalCentered = True
    sheet.page_margins = PageMargins(left=0.35, right=0.35, top=0.3, bottom=0.35,
                                    header=0.1, footer=0.15)
    sheet.page_setup.orientation = "portrait"
    sheet.page_setup.paperSize = sheet.PAPERSIZE_A4
    sheet.page_setup.scale = None
    sheet.page_setup.fitToWidth = 1
    sheet.page_setup.fitToHeight = 1
    sheet.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    sheet.oddFooter.right.text = "Página &P de &N"
    sheet.oddFooter.right.size = 8
    add_logo(sheet)
