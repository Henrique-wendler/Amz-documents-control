import { supabase, supabasePublishableKey, supabaseUrl } from "../lib/supabase";
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

const functionError = async (response: Response) => {
  try {
    const body = await response.json() as FunctionErrorBody;
    if (typeof body.error === "string" && body.error) return new Error(body.error);
  } catch {
    // The fallback intentionally hides transport and server implementation details.
  }
  return new Error("Não foi possível gerar o arquivo no momento.");
};

export const supabaseReportExportRepository: ReportExportRepository = {
  async generate(request: ReportExportRequest): Promise<ReportExportFile> {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.access_token) throw new Error("Sessão não autenticada. Entre novamente para exportar o relatório.");

    const url = new URL("functions/v1/generate-report", `${supabaseUrl.replace(/\/+$/, "")}/`);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: supabasePublishableKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
        cache: "no-store",
      });
    } catch {
      throw new Error("Não foi possível gerar o arquivo no momento.");
    }

    if (!response.ok) throw await functionError(response);
    const contentType = response.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
    if (contentType !== mimeTypes[request.format]) {
      throw new Error("O servidor não retornou um arquivo válido.");
    }
    const blob = await response.blob();
    if (!blob.size) throw new Error("O servidor não retornou um arquivo válido.");
    return {
      blob,
      fileName: readFileName(response.headers.get("Content-Disposition"), fallbackFileName(request.type, request.format)),
      reportId: response.headers.get("X-Report-Id") ?? "",
      format: request.format,
    };
  },
};
