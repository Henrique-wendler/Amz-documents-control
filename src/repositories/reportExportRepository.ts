import type { ReportPdfFile, ReportPdfRequest } from "../types/report";

export interface ReportExportRepository {
  generatePdf(request: ReportPdfRequest): Promise<ReportPdfFile>;
}
