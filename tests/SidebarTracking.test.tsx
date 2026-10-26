import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { Sidebar } from "../src/components/Sidebar";
const state = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("../src/hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (key: string) => state.permissions.includes(key),
  }),
}));
beforeEach(() => {
  state.permissions = [];
});
it("hides managerial navigation without report permission", () => {
  render(
    <FluentProvider theme={webLightTheme}>
      <Sidebar />
    </FluentProvider>,
  );
  expect(
    screen.queryByRole("button", { name: "Acompanhamento de Propostas" }),
  ).toBeNull();
});
it("shows managerial navigation with explicit report permission", () => {
  state.permissions = ["proposal_reports.read"];
  render(
    <FluentProvider theme={webLightTheme}>
      <Sidebar />
    </FluentProvider>,
  );
  expect(
    screen.getByRole("button", { name: "Acompanhamento de Propostas" }),
  ).toBeTruthy();
});
