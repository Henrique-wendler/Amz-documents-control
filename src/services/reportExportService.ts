import { supabaseReportExportRepository } from "../repositories/supabaseReportExportRepository";
import type { ReportExportFormat, ReportFilters, ReportType } from "../types/report";

export const reportExportService = {
  async download(type: ReportType, filters: ReportFilters, includeFinancial: boolean, format: ReportExportFormat) {
    const file = await supabaseReportExportRepository.generate({ type, filters, includeFinancial, format });
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
    return { fileName: file.fileName, reportId: file.reportId, format: file.format };
  },
};
