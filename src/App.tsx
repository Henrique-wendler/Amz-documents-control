import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Spinner,
  Toast,
  ToastTitle,
  Toaster,
  useToastController,
} from "@fluentui/react-components";
import { emptyGuaranteeForm, emptyGuaranteeItemForm, emptyOperationForm, operationService } from "./services/operationService";
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
import { RelatoriosPage } from "./pages/RelatoriosPage";
import { LoginPage } from "./pages/LoginPage";
import { MfaPage } from "./pages/MfaPage";
import { PasswordResetPage } from "./pages/PasswordResetPage";
import { useAuth } from "./contexts/AuthContext";
import { usePermissions } from "./hooks/usePermissions";

type DialogState =
  | { kind: "none" }
  | { kind: "delete-operation" }
  | { kind: "delete-guarantee" }
  | { kind: "close-guarantee" }
  | { kind: "delete-item" };

const emptyOperation = emptyOperationForm();
const emptyGuarantee = emptyGuaranteeForm();
const emptyItem = emptyGuaranteeItemForm();

export default function App() {
  const { session, profile, stage: authStage, loading: authLoading } = useAuth();
  const { hasPermission } = usePermissions();
  const financialAccess = useMemo(() => ({
    readFinancial: hasPermission("financial.read"),
    writeFinancial: hasPermission("financial.write"),
  }), [hasPermission]);
  const canWriteOperations = hasPermission("operations.write");
  const canDeleteOperations = hasPermission("operations.soft_delete");
  const canCloseOperations = hasPermission("operations.close");
  const canCancelOperations = hasPermission("operations.cancel");
  const canWriteGuarantees = hasPermission("guarantees.write");
  const canDeleteGuarantees = hasPermission("guarantees.soft_delete");
  const canCloseGuarantees = hasPermission("guarantees.close");
  const canCancelGuarantees = hasPermission("guarantees.cancel");
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

  const notify = (message: string, intent: "success" | "error" = "success") => {
    dispatchToast(
      <Toast>
        <ToastTitle>{message}</ToastTitle>
      </Toast>,
      { intent, timeout: 3600 },
    );
  };

  const loadData = async (showFeedback = false, operationId?: string) => {
    try {
      const loaded = await operationService.load(financialAccess, operationId);
      setData(loaded);
      setOperation(loaded.operation);
      const firstGuarantee = loaded.guarantees[0];
      const firstItem = firstGuarantee ? loaded.items.find((current) => current.guaranteeId === firstGuarantee.id) : undefined;
      setGuarantee(firstGuarantee ?? emptyGuaranteeForm(loaded.operation));
      setItem(firstItem ?? emptyGuaranteeItemForm(firstGuarantee?.id));
      setSelectedGuaranteeId(firstGuarantee?.id);
      setSelectedItemId(firstItem?.id);
      if (showFeedback) notify("Dados atualizados.");
    } catch (loadError) {
      notify(loadError instanceof Error ? loadError.message : "Não foi possível carregar as operações.", "error");
    }
  };

  useEffect(() => {
    if (profile) void loadData();
    else setData(undefined);
  }, [profile?.id, financialAccess.readFinancial, financialAccess.writeFinancial]);

  useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname.replace(/\/+$/, "") || "/");
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    const nextPath = authStage === "authenticated"
      ? ["/login", "/mfa", "/redefinir-senha"].includes(currentPath) ? "/dashboard" : currentPath
      : authStage === "mfa_enrollment" || authStage === "mfa_challenge"
        ? "/mfa"
        : authStage === "password_recovery"
          ? "/redefinir-senha"
          : "/login";

    if (nextPath !== currentPath) {
      window.history.replaceState({}, "", nextPath);
      setCurrentPath(nextPath);
    }
  }, [authLoading, authStage, currentPath]);

  const navigate = (path: string) => {
    const targetPath = new URL(path, window.location.origin).pathname.replace(/\/+$/, "") || "/";
    if (path === `${currentPath}${window.location.search}`) return;
    window.history.pushState({}, "", path);
    setCurrentPath(targetPath);
    if (targetPath === "/") void loadData(false, new URL(path, window.location.origin).searchParams.get("id") ?? undefined);
  };

  const activeGuarantees = useMemo(
    () => data?.guarantees.filter((current) => current.situacao === "Ativa").length ?? 0,
    [data],
  );

  if (authStage === "initializing") {
    return <div className="loading-screen"><Spinner label="Validando acesso…" /></div>;
  }

  if (authStage === "signed_out") {
    return <LoginPage />;
  }

  if (authStage === "mfa_enrollment" || authStage === "mfa_challenge") {
    return <MfaPage />;
  }

  if (authStage === "password_recovery") {
    return <PasswordResetPage />;
  }

  if (authStage !== "authenticated" || !session || !profile || ["/login", "/mfa", "/redefinir-senha"].includes(currentPath)) {
    return <div className="loading-screen"><Spinner label="Validando acesso…" /></div>;
  }

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

  if (currentPath === "/relatorios") {
    return <RelatoriosPage onNavigate={navigate} />;
  }

  if (!data) {
    return (
      <div className="loading-screen">
        <Spinner label="Carregando operações e garantias…" />
      </div>
    );
  }

  const selectGuarantee = (selected: GuaranteeFormModel) => {
    window.history.replaceState({}, "", `/?id=${operation.id}&garantia=${selected.id}`);
    setSelectedGuaranteeId(selected.id);
    setGuarantee({ ...selected });
    const linkedItem = data.items.find((current) => current.guaranteeId === selected.id);
    if (linkedItem) {
      setSelectedItemId(linkedItem.id);
      setItem({ ...linkedItem });
    } else {
      setSelectedItemId(undefined);
      setItem(emptyGuaranteeItemForm(selected.id));
    }
  };

  const selectItem = (selected: GuaranteeItemFormModel) => {
    setSelectedItemId(selected.id);
    setItem({ ...selected });
  };

  const removeSelectedGuarantee = async () => {
    try {
      const selected = data?.guarantees.find((current) => current.id === selectedGuaranteeId);
      if (!selected) return;
      const result = await operationService.deleteGuarantee(selected.id, selected.version);
      if (!result.deleted) return notify("Exclua primeiro os itens vinculados à garantia.", "error");
      await loadData();
      notify("Garantia excluída.");
    } catch (actionError) {
      notify(actionError instanceof Error ? actionError.message : "Não foi possível excluir a garantia.", "error");
    } finally {
      setDialog({ kind: "none" });
    }
  };

  const closeSelectedGuarantee = async () => {
    try {
      const selected = data?.guarantees.find((current) => current.id === selectedGuaranteeId);
      if (!selected) return;
      await operationService.closeGuarantee(selected, financialAccess);
      await loadData();
      notify("Garantia encerrada.");
    } catch (actionError) {
      notify(actionError instanceof Error ? actionError.message : "Não foi possível encerrar a garantia.", "error");
    } finally {
      setDialog({ kind: "none" });
    }
  };

  const removeSelectedItem = async () => {
    try {
      const selected = data?.items.find((current) => current.id === selectedItemId);
      if (!selected) return;
      await operationService.deleteGuaranteeItem(selected.id, selected.version);
      await loadData();
      notify("Item excluído.");
    } catch (actionError) {
      notify(actionError instanceof Error ? actionError.message : "Não foi possível excluir o item.", "error");
    } finally {
      setDialog({ kind: "none" });
    }
  };

  const saveCurrentOperation = async (message: string) => {
    try {
      const saved = await operationService.saveOperation(operation, financialAccess);
      window.history.replaceState({}, "", `/?id=${saved.id}`);
      await loadData(false, saved.id);
      notify(message);
    } catch (actionError) {
      notify(actionError instanceof Error ? actionError.message : "Não foi possível salvar a operação.", "error");
    }
  };

  const saveCurrentGuarantee = async (create: boolean) => {
    try {
      await operationService.saveGuarantee(create ? { ...guarantee, id: "", version: 0, operationId: operation.id } : guarantee, financialAccess);
      await loadData(false, operation.id);
      notify(create ? "Garantia cadastrada." : "Garantia atualizada.");
    } catch (actionError) {
      notify(actionError instanceof Error ? actionError.message : "Não foi possível salvar a garantia.", "error");
    }
  };

  const saveCurrentItem = async (create: boolean) => {
    if (!selectedGuaranteeId) return;
    try {
      await operationService.saveGuaranteeItem({ ...item, id: create ? "" : item.id, version: create ? 0 : item.version, guaranteeId: selectedGuaranteeId });
      await loadData(false, operation.id);
      notify(create ? "Item cadastrado." : "Item atualizado.");
    } catch (actionError) {
      notify(actionError instanceof Error ? actionError.message : "Não foi possível salvar o item.", "error");
    }
  };

  const dialogConfig = {
    "delete-operation": {
      title: "Excluir operação?",
      message: "Esta ação excluirá logicamente a operação atual. Deseja continuar?",
      confirmLabel: "Excluir",
      danger: true,
      onConfirm: () => void (async () => {
        try {
          if (!operation.id) return;
          const result = await operationService.deleteOperation(operation.id, operation.version);
          if (!result.deleted) return notify("Remova primeiro as garantias vinculadas à operação.", "error");
          window.history.replaceState({}, "", "/");
          await loadData();
          notify("Operação excluída.");
        } catch (actionError) {
          notify(actionError instanceof Error ? actionError.message : "Não foi possível excluir a operação.", "error");
        } finally {
          setDialog({ kind: "none" });
        }
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
  const selectedGuaranteeItems = data.items.filter((current) => current.guaranteeId === selectedGuaranteeId);

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
            operations={data.operations}
            institutions={data.institutions}
            registrations={data.registrations}
            canWrite={canWriteOperations}
            canDelete={canDeleteOperations}
            canClose={canCloseOperations}
            canCancel={canCancelOperations}
            canReadFinancial={financialAccess.readFinancial}
            canWriteFinancial={financialAccess.writeFinancial}
            onChange={setOperation}
            onSelectOperation={(id) => navigate(`/?id=${id}`)}
            onNew={() => {
              setOperation(emptyOperationForm());
              setGuarantee(emptyGuaranteeForm());
              setItem(emptyGuaranteeItemForm());
              setSelectedGuaranteeId(undefined);
              setSelectedItemId(undefined);
            }}
            onSave={() => void saveCurrentOperation("Operação salva com sucesso.")}
            onEdit={() => void saveCurrentOperation("Operação atualizada.")}
            onDelete={() => setDialog({ kind: "delete-operation" })}
            onClear={() => setOperation(emptyOperation)}
            onOpenRegistration={(id) => navigate(`/matriculas?open=${id}`)}
            onOpenFarm={(id) => navigate(`/fazendas?open=${id}`)}
          />

          <div className="lower-layout">
            <SectionCard
              title="Garantias da operação"
              subtitle="Vínculos, valores e situação"
              action={<Badge appearance="tint" color="success">{activeGuarantees} garantia ativa</Badge>}
            >
              <GuaranteeForm
                value={guarantee}
                registrations={data.registrations}
                guaranteeTypes={data.guaranteeTypes}
                availableRegistrationIds={operation.registrationIds}
                hasSelection={Boolean(selectedGuaranteeId)}
                canWrite={canWriteGuarantees}
                canDelete={canDeleteGuarantees}
                canClose={canCloseGuarantees}
                canCancel={canCancelGuarantees}
                canReadFinancial={financialAccess.readFinancial}
                canWriteFinancial={financialAccess.writeFinancial}
                onChange={setGuarantee}
                onCreate={() => void saveCurrentGuarantee(true)}
                onUpdate={() => void saveCurrentGuarantee(false)}
                onClose={() => setDialog({ kind: "close-guarantee" })}
                onDelete={() => setDialog({ kind: "delete-guarantee" })}
                onOpenSelected={() => {
                  const selected = data.guarantees.find((current) => current.id === selectedGuaranteeId);
                  if (selected) setGuarantee({ ...selected });
                }}
                onClear={() => setGuarantee(emptyGuaranteeForm(operation))}
                onList={() => notify("Lista de garantias atualizada.")}
                onOpenRegistration={(id) => navigate(`/matriculas?open=${id}`)}
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
                canWrite={canWriteGuarantees}
                canDelete={canDeleteGuarantees}
                onChange={setItem}
                onCreate={() => void saveCurrentItem(true)}
                onUpdate={() => void saveCurrentItem(false)}
                onDelete={() => setDialog({ kind: "delete-item" })}
                onSearch={() => notify("Busca de itens concluída.")}
                onClear={() => setItem(emptyGuaranteeItemForm(selectedGuaranteeId))}
                onList={() => notify("Lista de itens atualizada.")}
              />
              <div className="grid-section">
                <div className="grid-section__title">
                  <h3>Itens da garantia selecionada</h3>
                  <span>{selectedGuaranteeItems.length} registro</span>
                </div>
                <GuaranteeItemGrid items={selectedGuaranteeItems} selectedId={selectedItemId} onSelect={selectItem} />
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
