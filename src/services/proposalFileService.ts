import { proposalFileRepository } from "../repositories/proposalFileRepository";
import type { ProposalFile, ProposalFileRepository } from "../types/proposalFile";
export function createProposalFileService(repository: ProposalFileRepository) {
    return {
        list: (operationId: string) => repository.list(operationId),
        async open(file: ProposalFile) {
            if (file.kind !== "pdf")
                throw Error("A planilha está disponível somente para download.");
            const target = window.open("about:blank", "_blank");
            if (!target)
                throw Error("Não foi possível abrir a aba. Permita a abertura ou use Baixar.");
            target.opener = null;
            try {
                const result = await repository.authorize(file.id, "inline");
                target.location.replace(result.url);
            }
            catch {
                target.close();
                throw Error("Não foi possível visualizar o PDF. Confirme sua sessão e tente novamente.");
            }
        },
        async download(file: ProposalFile) {
            const result = await repository.authorize(file.id, "attachment");
            const anchor = document.createElement("a");
            anchor.href = result.url;
            anchor.download = file.filename;
            anchor.rel = "noopener noreferrer";
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
        }
    };
}
export const proposalFileService = createProposalFileService(proposalFileRepository);
