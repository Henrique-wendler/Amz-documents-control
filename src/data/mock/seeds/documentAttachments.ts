import type { DocumentAttachment } from "../../../types/domain";

// Referências meramente demonstrativas. Nunca armazenam usuário, senha, token ou credencial SMB.
export const documentAttachmentSeeds: DocumentAttachment[] = [
  { id: "ATT-001", documentId: "DOC-001", fileName: "licenca_ambiental.pdf", filePath: "\\\\ARQUIVOS\\Imoveis\\Fazenda Santa Clara\\Documentos\\licenca_ambiental.pdf", fileType: "PDF", fileSize: 1887437, createdAt: "2024-09-02", updatedAt: "2026-08-24" },
  { id: "ATT-002", documentId: "DOC-001", fileName: "protocolo_licenca.pdf", filePath: "\\\\ARQUIVOS\\Imoveis\\Fazenda Santa Clara\\Documentos\\protocolo_licenca.pdf", fileType: "PDF", fileSize: 358400, createdAt: "2024-09-02", updatedAt: "2026-08-24" },
  { id: "ATT-003", documentId: "DOC-002", fileName: "certidao_inteiro_teor.pdf", filePath: "\\\\ARQUIVOS\\Imoveis\\Fazenda Santa Clara\\Documentos\\certidao_inteiro_teor.pdf", fileType: "PDF", fileSize: 946176, createdAt: "2026-08-15", updatedAt: "2026-08-23" },
  { id: "ATT-004", documentId: "DOC-004", fileName: "itr_2026.pdf", filePath: "\\\\ARQUIVOS\\Imoveis\\Fazenda Boa Vista\\Documentos\\itr_2026.pdf", fileType: "PDF", fileSize: 624640, createdAt: "2026-08-20", updatedAt: "2026-08-21" },
  { id: "ATT-005", documentId: "DOC-007", fileName: "licenca_operacao.pdf", filePath: "\\\\ARQUIVOS\\Imoveis\\Fazenda Horizonte\\Documentos\\licenca_operacao.pdf", fileType: "PDF", fileSize: 1300480, createdAt: "2025-10-12", updatedAt: "2026-08-18" },
];
