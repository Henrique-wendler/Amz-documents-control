export type ReportType = "farms" | "owners" | "registrations" | "operations" | "guarantees" | "documents" | "car";
export type ReportExportFormat = "xlsx" | "pdf" | "csv";

export interface ReportFilters {
  farmId: string;
  status: string;
  startDate: string;
  endDate: string;
  ownerType: "all" | "individual" | "company";
  hp: "all" | "yes" | "no";
  bank: string;
  guaranteeType: string;
  documentType: string;
  expirationWindow: "all" | "30" | "60" | "90";
}

export interface ReportDefinition { id: ReportType; title: string; description: string; }
export interface ReportOption { value: string; label: string; }
export interface ReportColumn { key: string; label: string; align?: "start" | "end"; }
export interface ReportRow { id: string; values: Record<string, string>; }
export interface ReportMetric { label: string; value: string; }

export interface ReportViewModel {
  type: ReportType;
  title: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  metrics: ReportMetric[];
  generatedAt: string;
}

export interface ReportFilterOptions {
  farms: ReportOption[];
  banks: string[];
  guaranteeTypes: string[];
  documentTypes: string[];
  statuses: ReportOption[];
  hpAvailable: boolean;
}

export interface ReportLoadResult {
  report: ReportViewModel;
  options: ReportFilterOptions;
}
