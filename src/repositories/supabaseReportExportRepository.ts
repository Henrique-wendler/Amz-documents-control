import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { ReportExportFile, ReportExportFormat, ReportExportRequest } from "../types/report";
import type { ReportExportRepository } from "./reportExportRepository";

interface FunctionErrorBody {
  error?: string;
}

const mimeTypes: Record<ReportExportFormat, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const fallbackFileName = (type: ReportExportRequest["type"], format: ReportExportFormat) => `relatorio-${type}.${format}`;

const readFileName = (contentDisposition: string | null, fallback: string) => {
  const encoded = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try { return decodeURIComponent(encoded); } catch { return fallback; }
  }
  return contentDisposition?.match(/filename="([^"]+)"/i)?.[1] ?? fallback;
};

const functionError = async (error: unknown) => {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.clone().json() as FunctionErrorBody;
      if (body.error) return new Error(body.error);
    } catch {
      // The fallback intentionally hides transport and server implementation details.
    }
  }
  return new Error("Não foi possível gerar o arquivo no momento.");
};

export const supabaseReportExportRepository: ReportExportRepository = {
  async generate(request: ReportExportRequest): Promise<ReportExportFile> {
    const { data, error, response } = await supabase.functions.invoke("generate-report", { body: request });
    if (error) throw await functionError(error);
    if (!(data instanceof Blob) || data.type !== mimeTypes[request.format]) {
      throw new Error("O servidor não retornou um arquivo válido.");
    }
    return {
      blob: data,
      fileName: readFileName(response?.headers.get("Content-Disposition") ?? null, fallbackFileName(request.type, request.format)),
      reportId: response?.headers.get("X-Report-Id") ?? "",
      format: request.format,
    };
  },
};
