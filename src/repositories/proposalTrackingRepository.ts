import type {
  TrackingDraft,
  TrackingFilters,
  TrackingOption,
  TrackingOptions,
  TrackingReport,
} from "../types/proposalTracking";
export interface ProposalTrackingRepository {
  report(filters: TrackingFilters, page: number): Promise<TrackingReport>;
  options(): Promise<TrackingOptions>;
  searchOperations(query: string): Promise<TrackingOption[]>;
  save(
    operationId: string,
    version: number | null,
    draft: TrackingDraft,
  ): Promise<void>;
}
