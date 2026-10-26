import { supabaseProposalTrackingRepository } from "../repositories/supabaseProposalTrackingRepository";
import { createProposalTrackingService } from "./proposalTrackingServiceCore";
export const proposalTrackingService = createProposalTrackingService(
  supabaseProposalTrackingRepository,
);
