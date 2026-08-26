import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Spinner,
  Toast,
  ToastTitle,
  Toaster,
  useToastController,
} from "@fluentui/react-components";
import { operationService } from "./services/operationService";
import type { AppData, GuaranteeFormModel, GuaranteeItemFormModel, OperationFormModel } from "./types/models";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { OperationForm } from "./components/OperationForm";
import { SectionCard } from "./components/SectionCard";
import { GuaranteeForm } from "./components/GuaranteeForm";
import { GuaranteeGrid } from "./components/GuaranteeGrid";
import { GuaranteeItemForm } from "./components/GuaranteeItemForm";
import { GuaranteeItemGrid } from "./components/GuaranteeItemGrid";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { DashboardPage } from "./pages/DashboardPage";
import { ConsultaPage } from "./pages/ConsultaPage";
import { ProprietariosPage } from "./pages/ProprietariosPage";
import { FazendasPage } from "./pages/FazendasPage";
import { MatriculasPage } from "./pages/MatriculasPage";
import { DocumentosPage } from "./pages/DocumentosPage";
import { CarPage } from "./pages/CarPage";

type DialogState =
  | { kind: "none" }
  | { kind: "delete-operation" }
  | { kind: "delete-guarantee" }
  | { kind: "close-guarantee" }
  | { kind: "delete-item" };

const emptyOperation: OperationFormModel = {
  id: "",
  matricula: "",
  banco: "",
  numero: "",
  finalidade: "",
  valor: "",
  situacao: "Em análise",
  dataInicio: "",
};

const emptyGuarantee: GuaranteeFormModel = {
  id: "",
  numeroOperacao: "",
  matricula: "",
  fazenda: "",
  banco: "",
  tipo: "",
  descricao: "",
  grau: "",
  valor: "",
  anoAvaliacao: "",
  situacao: "Ativa",
  dataInicio: "",
  dataVencimento: "",
  observacoes: "",
};

const emptyItem: GuaranteeItemFormModel = {
  id: "",
  guaranteeId: "",
  categoria: "",
  descricao: "",
  quantidade: 0,
  unidade: "",
  observacoes: "",
};

export default function App() {
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname.replace(/\/+$/, "") || "/");
  const [data, setData] = useState<AppData>();
  const [operation, setOperation] = useState<OperationFormModel>(emptyOperation);
  const [guarantee, setGuarantee] = useState<GuaranteeFormModel>(emptyGuarantee);
  const [item, setItem] = useState<GuaranteeItemFormModel>(emptyItem);
  const [selectedGuaranteeId, setSelectedGuaranteeId] = useState<string>();
  const [selectedItemId, setSelectedItemId] = useState<string>();
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const toasterId = "system-feedback";
  const { dispatchToast } = useToastController(toasterId);

  const notify = (message: string) => {
    dispatchToast(
      <Toast>
        <ToastTitle>{message}</ToastTitle>
      </Toast>,
      { intent: "success", timeout: 2800 },
    );
  };

  const loadData = async (showFeedback = false) => {
    const loaded = await operationService.load();
    setData(loaded);
    setOperation(loaded.operation);
    const firstGuarantee = loaded.guarantees[0];
    const firstItem = loaded.items[0];
    setGuarantee(firstGuarantee ?? emptyGuarantee);
    setItem(firstItem ?? emptyItem);
    setSelectedGuaranteeId(firstGuarantee?.id);
    setSelectedItemId(firstItem?.id);
    if (showFeedback) notify("Dados atualizados.");
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname.replace(/\/+$/, "") || "/");
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = (path: string) => {
    const targetPath = new URL(path, window.location.origin).pathname.replace(/\/+$/, "") || "/";
    if (path === `${currentPath}${window.location.search}`) return;
    window.history.pushState({}, "", path);
    setCurrentPath(targetPath);
    if (targetPath === "/") void loadData();
  };

  const activeGuarantees = useMemo(
    () => data?.guarantees.filter((current) => current.situacao === "Ativa").length ?? 0,
    [data],
  );

  if (currentPath === "/dashboard") {
    return <DashboardPage onNavigate={navigate} />;
  }

  if (currentPath === "/consulta") {
    return <ConsultaPage onNavigate={navigate} />;
  }

  if (currentPath === "/proprietarios") {
    return <ProprietariosPage onNavigate={navigate} />;
  }

  if (currentPath === "/fazendas") {
    return <FazendasPage onNavigate={navigate} />;
  }

  if (currentPath === "/matriculas") {
    return <MatriculasPage onNavigate={navigate} />;
  }

  if (currentPath === "/documentos") {
    return <DocumentosPage onNavigate={navigate} />;
  }

  if (currentPath === "/car") {
    return <CarPage onNavigate={navigate} />;
  }

  if (!data) {
    return (
      <div className="loading-screen">
        <Spinner label="Preparando o protótipo…" />
      </div>
    );
  }

  const selectGuarantee = (selected: GuaranteeFormModel) => {
    setSelectedGuaranteeId(selected.id);
    setGuarantee({ ...selected });
    const linkedItem = data.items.find((current) => current.guaranteeId === selected.id);
    if (linkedItem) {
      setSelectedItemId(linkedItem.id);
      setItem({ ...linkedItem });
    }
  };

  const selectItem = (selected: GuaranteeItemFormModel) => {
    setSelectedItemId(selected.id);
    setItem({ ...selected });
  };

  const removeSelectedGuarantee = async () => {
    if (selectedGuaranteeId) await operationService.deleteGuarantee(selectedGuaranteeId);
    await loadData();
    setDialog({ kind: "none" });
    notify("Garantia excluída.");
  };

  const closeSelectedGuarantee = async () => {
    if (selectedGuaranteeId) await operationService.closeGuarantee(selectedGuaranteeId);
    await loadData();
    setDialog({ kind: "none" });
    notify("Garantia encerrada.");
  };

  const removeSelectedItem = async () => {
    if (selectedItemId) await operationService.deleteGuaranteeItem(selectedItemId);
    await loadData();
    setDialog({ kind: "none" });
    notify("Item excluído.");
  };

  const saveCurrentOperation = async (message: string) => {
    const saved = await operationService.saveOperation(operation);
    setOperation(saved);
    setData((current) => current ? { ...current, operation: saved } : current);
    notify(message);
  };

  const saveCurrentGuarantee = async (create: boolean) => {
    await operationService.saveGuarantee(create ? { ...guarantee, id: "" } : guarantee);
    await loadData();
    notify(create ? "Garantia cadastrada." : "Garantia atualizada.");
  };

  const saveCurrentItem = async (create: boolean) => {
    if (!selectedGuaranteeId) return;
    await operationService.saveGuaranteeItem({ ...item, id: create ? "" : item.id, guaranteeId: selectedGuaranteeId });
    await loadData();
    notify(create ? "Item cadastrado." : "Item atualizado.");
  };

  const dialogConfig = {
    "delete-operation": {
      title: "Excluir operação?",
      message: "Esta ação removerá a operação atual do protótipo. Deseja continuar?",
      confirmLabel: "Excluir",
      danger: true,
      onConfirm: () => void (async () => {
        if (operation.id) await operationService.deleteOperation(operation.id);
        setOperation(emptyOperation);
        setData({ operation: emptyOperation, guarantees: [], items: [] });
        setDialog({ kind: "none" });
        notify("Operação excluída.");
      })(),
    },
    "delete-guarantee": {
      title: "Excluir garantia?",
      message: "Esta ação removerá a garantia selecionada. Deseja continuar?",
      confirmLabel: "Excluir",
      danger: true,
      onConfirm: () => void removeSelectedGuarantee(),
    },
    "close-guarantee": {
      title: "Encerrar garantia?",
      message: "A garantia selecionada será marcada como encerrada. Deseja continuar?",
      confirmLabel: "Encerrar",
      danger: false,
      onConfirm: () => void closeSelectedGuarantee(),
    },
    "delete-item": {
      title: "Excluir item?",
      message: "Esta ação removerá o item selecionado da garantia. Deseja continuar?",
      confirmLabel: "Excluir",
      danger: true,
      onConfirm: () => void removeSelectedItem(),
    },
  } as const;

  const activeDialog = dialog.kind === "none" ? undefined : dialogConfig[dialog.kind];

  return (
    <div className="app-shell">
      <Sidebar activePath="/" onNavigate={navigate} />
      <div className="app-workspace">
        <Header onRefresh={() => void loadData(true)} />
        <main className="main-content">
          <div className="flow-label" aria-label="Fluxo da tela">
            <span>Operação</span><strong>›</strong><span>Garantias</span><strong>›</strong><span>Itens da garantia</span>
          </div>

          <OperationForm
            value={operation}
            onChange={setOperation}
            onNew={() => setOperation(emptyOperation)}
            onSave={() => void saveCurrentOperation("Operação salva com sucesso.")}
            onEdit={() => void saveCurrentOperation("Operação atualizada.")}
            onDelete={() => setDialog({ kind: "delete-operation" })}
            onClear={() => setOperation(emptyOperation)}
          />

          <div className="lower-layout">
            <SectionCard
              title="Garantias da operação"
              subtitle="Vínculos, valores e situação"
              action={<Badge appearance="tint" color="success">{activeGuarantees} garantia ativa</Badge>}
            >
              <GuaranteeForm
                value={guarantee}
                hasSelection={Boolean(selectedGuaranteeId)}
                onChange={setGuarantee}
                onCreate={() => void saveCurrentGuarantee(true)}
                onUpdate={() => void saveCurrentGuarantee(false)}
                onClose={() => setDialog({ kind: "close-guarantee" })}
                onDelete={() => setDialog({ kind: "delete-guarantee" })}
                onOpenSelected={() => {
                  const selected = data.guarantees.find((current) => current.id === selectedGuaranteeId);
                  if (selected) setGuarantee({ ...selected });
                }}
                onClear={() => setGuarantee(emptyGuarantee)}
                onList={() => notify("Lista de garantias atualizada.")}
              />
              <div className="grid-section">
                <div className="grid-section__title">
                  <h3>Garantias vinculadas</h3>
                  <span>{data.guarantees.length} registro</span>
                </div>
                <GuaranteeGrid items={data.guarantees} selectedId={selectedGuaranteeId} onSelect={selectGuarantee} />
              </div>
            </SectionCard>

            <SectionCard title="Itens da garantia" subtitle="Bens vinculados à garantia selecionada">
              <GuaranteeItemForm
                value={item}
                hasSelection={Boolean(selectedItemId)}
                onChange={setItem}
                onCreate={() => void saveCurrentItem(true)}
                onUpdate={() => void saveCurrentItem(false)}
                onDelete={() => setDialog({ kind: "delete-item" })}
                onSearch={() => notify("Busca de itens concluída.")}
                onClear={() => setItem(emptyItem)}
                onList={() => notify("Lista de itens atualizada.")}
              />
              <div className="grid-section">
                <div className="grid-section__title">
                  <h3>Itens da garantia selecionada</h3>
                  <span>{data.items.length} registro</span>
                </div>
                <GuaranteeItemGrid items={data.items} selectedId={selectedItemId} onSelect={selectItem} />
              </div>
            </SectionCard>
          </div>
        </main>
      </div>

      <Toaster toasterId={toasterId} position="top-end" />
      {activeDialog ? (
        <ConfirmDialog
          open
          title={activeDialog.title}
          message={activeDialog.message}
          confirmLabel={activeDialog.confirmLabel}
          danger={activeDialog.danger}
          onCancel={() => setDialog({ kind: "none" })}
          onConfirm={activeDialog.onConfirm}
        />
      ) : null}
    </div>
  );
}
