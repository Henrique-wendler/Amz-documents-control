import { useEffect, useState } from "react";
import { Button, Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions, Spinner } from "@fluentui/react-components";
import { proposalFileService } from "../../services/proposalFileService";
import type { ProposalFile } from "../../types/proposalFile";
export function ProposalFiles({ operationId, number, onClose }: {
    operationId: string;
    number: string;
    onClose: () => void;
}) {
    const [files, setFiles] = useState<ProposalFile[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(""), [busy, setBusy] = useState(false), [reload, setReload] = useState(0);
    useEffect(() => { let live = true; setLoading(true); setError(""); proposalFileService.list(operationId).then(data => { if (live)
        setFiles(data); }).catch(() => { if (live)
        setError("Não foi possível carregar os arquivos da proposta."); }).finally(() => { if (live)
        setLoading(false); }); return () => { live = false; }; }, [operationId, reload]);
    async function action(file: ProposalFile, preview: boolean) { setBusy(true); setError(""); try {
        if (preview)
            await proposalFileService.open(file);
        else
            await proposalFileService.download(file);
    }
    catch (reason) {
        setError(reason instanceof Error ? reason.message : "Não foi possível acessar o arquivo.");
    }
    finally {
        setBusy(false);
    } }
    return <Dialog open onOpenChange={(_, data) => { if (!data.open)
        onClose(); }}><DialogSurface><DialogBody>
  <DialogTitle>Arquivos da proposta — {number}</DialogTitle><DialogContent>
   {loading ? <Spinner label="Carregando arquivos da proposta…"/> : <>{(["pdf", "xlsx"] as const).map(kind => {
                const file = files.find(f => f.kind === kind);
                return <section key={kind} aria-label={kind.toUpperCase()} style={{ marginBottom: 20 }}>
    <h3>{kind.toUpperCase()}</h3>{file ? <><p>{file.filename}</p><p>Versão atual {file.version} · {new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(file.sizeBytes / 1024)} KiB · {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Araguaina" }).format(new Date(file.createdAt))}</p>
    {kind === "pdf" && <Button disabled={busy} onClick={() => void action(file, true)}>Visualizar PDF</Button>} <Button disabled={busy} onClick={() => void action(file, false)}>Baixar {kind.toUpperCase()}</Button></> : <p>Arquivo ainda não enviado pelo aplicativo desktop.</p>}</section>;
            })}</>}
   {error && <p role="alert">{error}</p>}
  </DialogContent><DialogActions><Button disabled={loading || busy} onClick={() => setReload(v => v + 1)}>Atualizar arquivos</Button><Button onClick={onClose}>Fechar</Button></DialogActions>
 </DialogBody></DialogSurface></Dialog>;
}
