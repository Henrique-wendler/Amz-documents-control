import { Button, Skeleton, SkeletonItem } from "@fluentui/react-components";
import { ArrowSync20Regular, Info24Regular, Warning24Regular } from "@fluentui/react-icons";

export function DashboardLoadingState() {
  return (
    <div className="dashboard-loading" aria-label="Carregando visão geral">
      <Skeleton className="dashboard-loading__kpis">
        {Array.from({ length: 6 }, (_, index) => <SkeletonItem key={index} shape="rectangle" size={96} />)}
      </Skeleton>
      <Skeleton className="dashboard-loading__panels">
        <SkeletonItem className="dashboard-loading__panel" shape="rectangle" size={128} />
        <SkeletonItem className="dashboard-loading__panel" shape="rectangle" size={128} />
      </Skeleton>
    </div>
  );
}

interface DashboardMessageStateProps {
  kind: "empty" | "error";
  onRetry: () => void;
  title?: string;
  description?: string;
}

export function DashboardMessageState({ kind, onRetry, title, description }: DashboardMessageStateProps) {
  const Icon = kind === "error" ? Warning24Regular : Info24Regular;
  return (
    <section className={`dashboard-message dashboard-message--${kind}`}>
      <span className="dashboard-message__icon"><Icon /></span>
      <h2>{title ?? (kind === "error" ? "Não foi possível carregar a Visão Geral" : "Nenhum dado disponível")}</h2>
      <p>{description ?? (kind === "error" ? "Tente carregar novamente os indicadores do sistema." : "Não existem registros para os filtros selecionados.")}</p>
      <Button appearance="primary" icon={<ArrowSync20Regular />} onClick={onRetry}>Tentar novamente</Button>
    </section>
  );
}
