import { supabaseReportExportRepository } from "../repositories/supabaseReportExportRepository";
import type { ReportFilters, ReportType } from "../types/report";

export const reportExportService = {
  async downloadPdf(type: ReportType, filters: ReportFilters, includeFinancial: boolean) {
    const file = await supabaseReportExportRepository.generatePdf({ type, filters, includeFinancial });
    const objectUrl = URL.createObjectURL(file.blob);
    try {
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = file.fileName;
      anchor.rel = "noopener";
      anchor.click();
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    }
    return { fileName: file.fileName, reportId: file.reportId };
  },
};
