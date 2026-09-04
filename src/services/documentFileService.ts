import { supabaseDocumentFileRepository } from "../repositories/supabaseDocumentFileRepository";

export const documentUploadAccept = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
].join(",");

const maximumBytes = 20 * 1024 * 1024;

export const documentFileService = {
  async upload(documentId: string, file: File) {
    if (!file.name.trim()) throw new Error("Selecione um arquivo válido.");
    if (!file.type || !documentUploadAccept.split(",").includes(file.type.toLocaleLowerCase("en-US"))) {
      throw new Error("Este tipo de arquivo não é permitido.");
    }
    if (file.size <= 0) throw new Error("O arquivo está vazio.");
    if (file.size > maximumBytes) throw new Error("O arquivo excede o limite de 20 MB.");
    return supabaseDocumentFileRepository.upload(documentId, file);
  },

  async download(locationId: string) {
    const authorization = await supabaseDocumentFileRepository.download(locationId);
    const anchor = document.createElement("a");
    anchor.href = authorization.signedUrl;
    anchor.download = authorization.fileName;
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return authorization;
  },

  async removeLocation(locationId: string, expectedVersion: number) {
    return supabaseDocumentFileRepository.removeLocation(locationId, expectedVersion);
  },

  async requestRemoteCopy(attachmentId: string, sourceLocationId: string) {
    return supabaseDocumentFileRepository.requestRemoteCopy(attachmentId, sourceLocationId);
  },
};
