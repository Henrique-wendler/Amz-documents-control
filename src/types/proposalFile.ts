export type ProposalFileKind = "pdf" | "xlsx";
export interface ProposalFile {
    id: string;
    operationId: string;
    syncId: string;
    kind: ProposalFileKind;
    filename: string;
    sha256: string;
    sizeBytes: number;
    version: number;
    createdAt: string;
    isCurrent: boolean;
}
export interface ProposalFileRepository {
    list(operationId: string): Promise<ProposalFile[]>;
    authorize(fileId: string, disposition: "inline" | "attachment"): Promise<{
        url: string;
        expiresIn: number;
    }>;
}
