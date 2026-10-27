import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from "@fluentui/react-components";
import { SectionCard } from "../SectionCard";
import {
  trackingCurrency,
  trackingDays,
} from "../../services/proposalTrackingPresentation";
import type { TrackingGroup } from "../../types/proposalTracking";
export function TrackingGroups({
  title,
  heading,
  groups,
  financial,
}: {
  title: string;
  heading: string;
  groups: TrackingGroup[];
  financial: boolean;
}) {
  return (
    <SectionCard
      title={title}
      subtitle="Somente propostas atualmente atrasadas"
    >
      {!groups.length ? (
        <p>Nenhum atraso neste agrupamento.</p>
      ) : (
        <div className="tracking-table-scroll">
          <Table aria-label={title}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>{heading}</TableHeaderCell>
                <TableHeaderCell>Atrasadas</TableHeaderCell>
                {financial && <TableHeaderCell>Valor total</TableHeaderCell>}
                <TableHeaderCell>Atraso médio</TableHeaderCell>
                <TableHeaderCell>Maior atraso</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) => (
                <TableRow key={group.key}>
                  <TableCell>{group.name}</TableCell>
                  <TableCell>{group.overdueCount}</TableCell>
                  {financial && (
                    <TableCell>
                      {trackingCurrency(group.overdueAmountTotal)}
                    </TableCell>
                  )}
                  <TableCell>{trackingDays(group.averageDays)}</TableCell>
                  <TableCell>{trackingDays(group.maximumDays)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </SectionCard>
  );
}
