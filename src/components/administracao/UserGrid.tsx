import { useMemo } from "react";
import { Badge, Button, DataGrid, DataGridBody, DataGridCell, DataGridHeader, DataGridHeaderCell, DataGridRow, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, Skeleton, SkeletonItem, Tooltip, createTableColumn } from "@fluentui/react-components";
import type { TableColumnDefinition } from "@fluentui/react-components";
import { Edit20Regular, KeyReset20Regular, MoreHorizontal20Regular, PersonAvailable20Regular, PersonProhibited20Regular } from "@fluentui/react-icons";
import type { ManagedUser, UserRoleOption } from "../../types/userAdministration";
import { StatusBadge } from "../StatusBadge";

interface UserGridProps {
  users: ManagedUser[];
  roles: UserRoleOption[];
  loading: boolean;
  onEdit: (user: ManagedUser) => void;
  onToggleStatus: (user: ManagedUser) => void;
  onSendRecovery: (user: ManagedUser) => void;
}

const formatTimestamp = (value?: string) => value ? new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Araguaina",
}).format(new Date(value)) : "Nunca acessou";

const textCell = (value: string, strong = false) => <Tooltip content={value} relationship="description"><span className={`search-cell-text${strong ? " search-cell-text--strong" : ""}`}>{value}</span></Tooltip>;

export function UserGrid({ users, roles, loading, onEdit, onToggleStatus, onSendRecovery }: UserGridProps) {
  const roleNames = useMemo(() => new Map(roles.map((role) => [role.key, role.name])), [roles]);
  const columns: TableColumnDefinition<ManagedUser>[] = useMemo(() => [
    createTableColumn({ columnId: "name", compare: (a, b) => a.fullName.localeCompare(b.fullName, "pt-BR"), renderHeaderCell: () => "Nome", renderCell: (user) => textCell(user.fullName, true) }),
    createTableColumn({ columnId: "email", compare: (a, b) => a.email.localeCompare(b.email), renderHeaderCell: () => "E-mail", renderCell: (user) => textCell(user.email || "E-mail indisponível") }),
    createTableColumn({ columnId: "role", compare: (a, b) => a.roleKey.localeCompare(b.roleKey), renderHeaderCell: () => "Perfil", renderCell: (user) => roleNames.get(user.roleKey) ?? user.roleKey }),
    createTableColumn({ columnId: "mfa", compare: (a, b) => Number(a.mfaConfigured) - Number(b.mfaConfigured), renderHeaderCell: () => "MFA", renderCell: (user) => <Badge appearance="tint" color={user.mfaConfigured ? "success" : "warning"}>{user.mfaConfigured ? "Configurado" : "Pendente"}</Badge> }),
    createTableColumn({ columnId: "status", compare: (a, b) => a.status.localeCompare(b.status), renderHeaderCell: () => "Situação", renderCell: (user) => <StatusBadge status={user.status === "active" ? "Ativo" : "Inativo"} /> }),
    createTableColumn({ columnId: "created", compare: (a, b) => a.createdAt.localeCompare(b.createdAt), renderHeaderCell: () => "Criado em", renderCell: (user) => formatTimestamp(user.createdAt) }),
    createTableColumn({ columnId: "lastAccess", compare: (a, b) => (a.lastSignInAt ?? "").localeCompare(b.lastSignInAt ?? ""), renderHeaderCell: () => "Último acesso", renderCell: (user) => formatTimestamp(user.lastSignInAt) }),
    createTableColumn({
      columnId: "actions",
      renderHeaderCell: () => "Ações",
      renderCell: (user) => <div className="user-administration-grid__actions" onClick={(event) => event.stopPropagation()}>
        <Menu positioning="below-end">
          <MenuTrigger disableButtonEnhancement><Button appearance="subtle" size="small" icon={<MoreHorizontal20Regular />} aria-label={`Ações para ${user.fullName}`} /></MenuTrigger>
          <MenuPopover><MenuList>
            <MenuItem icon={<Edit20Regular />} onClick={() => onEdit(user)}>Editar usuário</MenuItem>
            <MenuItem icon={user.status === "active" ? <PersonProhibited20Regular /> : <PersonAvailable20Regular />} onClick={() => onToggleStatus(user)}>{user.status === "active" ? "Inativar" : "Reativar"}</MenuItem>
            <MenuItem icon={<KeyReset20Regular />} disabled={user.status !== "active"} onClick={() => onSendRecovery(user)}>{user.lastSignInAt ? "Enviar recuperação de senha" : "Reenviar acesso"}</MenuItem>
          </MenuList></MenuPopover>
        </Menu>
      </div>,
    }),
  ], [onEdit, onSendRecovery, onToggleStatus, roleNames]);

  if (loading) return <Skeleton className="search-results-skeleton" aria-label="Carregando usuários">{Array.from({ length: 7 }, (_, index) => <SkeletonItem key={index} shape="rectangle" size={40} />)}</Skeleton>;
  if (!users.length) return <div className="user-administration-empty"><strong>Nenhum usuário encontrado</strong><span>Ajuste os filtros ou convide o primeiro usuário desta organização.</span></div>;

  return <div className="data-grid-wrap user-administration-grid" aria-label="Lista de usuários">
    <DataGrid items={users} columns={columns} size="small" sortable getRowId={(user) => user.id}>
      <DataGridHeader><DataGridRow>{({ renderHeaderCell, columnId }) => <DataGridHeaderCell className={`user-column--${String(columnId)}`}>{renderHeaderCell()}</DataGridHeaderCell>}</DataGridRow></DataGridHeader>
      <DataGridBody<ManagedUser>>{({ item, rowId }) => <DataGridRow<ManagedUser> key={rowId} onClick={() => onEdit(item)}>{({ renderCell, columnId }) => <DataGridCell className={`user-column--${String(columnId)}`}>{renderCell(item)}</DataGridCell>}</DataGridRow>}</DataGridBody>
    </DataGrid>
  </div>;
}
