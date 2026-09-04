import type { ReportExportFile, ReportExportRequest } from "../types/report";

export interface ReportExportRepository {
  generate(request: ReportExportRequest): Promise<ReportExportFile>;
}
