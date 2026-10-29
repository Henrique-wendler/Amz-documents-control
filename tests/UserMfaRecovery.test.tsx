import {render,screen,waitFor,within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {FluentProvider,webLightTheme} from "@fluentui/react-components";
import {beforeEach,expect,it,vi} from "vitest";
import {UsersPage} from "../src/pages/UsersPage";
import type {ManagedUser} from "../src/types/userAdministration";
const state=vi.hoisted(()=>({allowed:true,service:{list:vi.fn(),resetMfa:vi.fn(),sendRecovery:vi.fn()}}));
vi.mock("../src/services/userAdministrationService",()=>({userAdministrationService:state.service}));
vi.mock("../src/hooks/usePermissions",()=>({usePermissions:()=>({hasPermission:(key:string)=>state.allowed&&key==="users.manage"})}));
vi.mock("../src/contexts/AuthContext",()=>({useAuth:()=>({profile:{id:"actor"},refreshProfile:vi.fn()})}));
vi.mock("../src/components/Sidebar",()=>({Sidebar:()=>null}));
vi.mock("../src/components/Header",()=>({Header:()=>null}));
vi.mock("../src/components/administracao/UserFormDrawer",()=>({UserFormDrawer:()=>null}));
const managed:ManagedUser={id:"target",fullName:"Pessoa Exemplo",email:"target@example.invalid",roleKey:"manager",status:"active",mfaConfigured:true,mfaHasFactors:true,createdAt:"2026-10-29T12:00:00Z"};
let row:ManagedUser;
beforeEach(()=>{vi.resetAllMocks();state.allowed=true;row={...managed};state.service.list.mockImplementation(async()=>({users:[row],roles:[{key:"manager",name:"Gestor"}]}));state.service.resetMfa.mockResolvedValue(undefined);});
function show(){return render(<FluentProvider theme={webLightTheme}><UsersPage onNavigate={()=>undefined}/></FluentProvider>);}
async function menu(){await userEvent.click(await screen.findByRole("button",{name:"Ações para Pessoa Exemplo"}));}
it("shows verified MFA and offers reset for a user with factors",async()=>{show();await screen.findByText("MFA configurado");await menu();expect(screen.getByRole("menuitem",{name:"Redefinir MFA"})).toBeTruthy();await userEvent.keyboard("{Escape}");});
it("unverified factor is not configured, but may be reset",async()=>{row.mfaConfigured=false;show();await screen.findByText("MFA não configurado");await menu();expect(screen.getByRole("menuitem",{name:"Redefinir MFA"})).toBeTruthy();await userEvent.keyboard("{Escape}");});
it("zero factors has no reset action",async()=>{row.mfaConfigured=false;row.mfaHasFactors=false;show();await menu();expect(screen.queryByRole("menuitem",{name:"Redefinir MFA"})).toBeNull();await userEvent.keyboard("{Escape}");});
it("cancel leaves authenticators unchanged",async()=>{show();await menu();await userEvent.click(screen.getByRole("menuitem",{name:"Redefinir MFA"}));const dialog=await screen.findByRole("alertdialog");expect(within(dialog).getByText(/Os autenticadores cadastrados para Pessoa Exemplo/)).toBeTruthy();await userEvent.click(await within(dialog).findByRole("button",{name:"Cancelar"}));expect(state.service.resetMfa).not.toHaveBeenCalled();});
it("confirmation sends only target ID and reloads MFA status",async()=>{show();await menu();await userEvent.click(screen.getByRole("menuitem",{name:"Redefinir MFA"}));const dialog=await screen.findByRole("alertdialog");state.service.resetMfa.mockImplementation(async()=>{row={...row,mfaConfigured:false,mfaHasFactors:false};});await userEvent.click(await within(dialog).findByRole("button",{name:"Redefinir MFA"}));await waitFor(()=>expect(state.service.resetMfa).toHaveBeenCalledExactlyOnceWith("target"));await screen.findByText("MFA não configurado");expect(state.service.sendRecovery).not.toHaveBeenCalled();});
it("no users.manage means no report or administrative action",async()=>{state.allowed=false;show();await screen.findByText("Acesso não autorizado");expect(state.service.list).not.toHaveBeenCalled();expect(screen.queryByText("Redefinir MFA")).toBeNull();});
it("public backend failure never claims success",async()=>{state.service.resetMfa.mockRejectedValue(new Error("A redefinição não foi concluída."));show();await menu();await userEvent.click(screen.getByRole("menuitem",{name:"Redefinir MFA"}));const dialog=await screen.findByRole("alertdialog");await userEvent.click(await within(dialog).findByRole("button",{name:"Redefinir MFA"}));await screen.findByText("A redefinição não foi concluída.");expect(screen.queryByText(/MFA redefinido\./)).toBeNull();});
