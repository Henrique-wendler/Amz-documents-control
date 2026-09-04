import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { DocumentFileRepository } from "./documentFileRepository";
import { supabaseDocumentAttachmentRepository } from "./supabaseDocumentAttachmentRepository";

interface FunctionErrorBody { error?: string; code?: string; }
interface PreparedUpload { attachmentId: string; locationId: string; bucketId: string; objectKey: string; uploadToken: string; maximumBytes: number; }
interface DownloadAuthorization { signedUrl: string; fileName: string; expiresIn: number; }

const functionError = async (error: unknown, fallback: string) => {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload = await error.context.json() as FunctionErrorBody;
      if (payload.error) return new Error(payload.error);
    } catch {
      // Transport details stay hidden from the interface.
    }
  }
  return new Error(fallback);
};

const invoke = async <T>(body: Record<string, unknown>, fallback: string): Promise<T> => {
  const { data, error } = await supabase.functions.invoke("document-files", { body });
  if (error) throw await functionError(error, fallback);
  return data as T;
};

export const supabaseDocumentFileRepository: DocumentFileRepository = {
  async upload(documentId, file) {
    const prepared = await invoke<PreparedUpload>({
      action: "prepare-upload",
      documentId,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
    }, "Não foi possível preparar o envio do arquivo.");

    let finalized = false;
    try {
      const { error: uploadError } = await supabase.storage
        .from(prepared.bucketId)
        .uploadToSignedUrl(prepared.objectKey, prepared.uploadToken, file, {
          contentType: file.type,
          cacheControl: "3600",
          upsert: false,
        });
      if (uploadError) throw new Error("Não foi possível enviar o arquivo ao armazenamento.");

      const finalizedUpload = await invoke<{ checksum: string }>({
        action: "finalize-upload",
        attachmentId: prepared.attachmentId,
        locationId: prepared.locationId,
      }, "Não foi possível finalizar o envio do arquivo.");
      finalized = true;
      const attachment = await supabaseDocumentAttachmentRepository.getById(prepared.attachmentId);
      if (!attachment) throw new Error("O arquivo foi enviado, mas seus metadados não puderam ser carregados.");
      return { attachment, checksum: finalizedUpload.checksum };
    } catch (error) {
      if (!finalized) {
        try {
          await invoke({
            action: "abort-upload",
            attachmentId: prepared.attachmentId,
            locationId: prepared.locationId,
          }, "Não foi possível compensar o envio interrompido.");
        } catch {
          // The server-side finalize flow also performs best-effort compensation.
        }
      }
      throw error;
    }
  },

  async download(locationId) {
    return invoke<DownloadAuthorization>({ action: "download", locationId }, "Não foi possível autorizar o download.");
  },

  async removeLocation(locationId, expectedVersion) {
    await invoke({ action: "remove-location", locationId, expectedVersion }, "Não foi possível remover a localização Cloud.");
  },

  async requestRemoteCopy(attachmentId, sourceLocationId) {
    return invoke<{ jobId: string; status: "pending" | "processing" | "completed" | "failed" }>({
      action: "request-remote-copy",
      attachmentId,
      sourceLocationId,
    }, "Não foi possível solicitar a disponibilização remota.");
  },
};
