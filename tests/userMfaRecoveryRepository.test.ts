import {beforeEach,expect,it,vi} from "vitest";
import {supabaseUserAdministrationRepository as repository} from "../src/repositories/supabaseUserAdministrationRepository";
const api=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock("../src/lib/supabase",()=>({supabase:{functions:api}}));
beforeEach(()=>vi.resetAllMocks());
it("reset boundary sends exactly action and target ID",async()=>{api.invoke.mockResolvedValue({data:{success:true},error:null});await repository.resetMfa("target-id");expect(api.invoke).toHaveBeenCalledExactlyOnceWith("admin-users",{body:{action:"reset_mfa",targetId:"target-id"}});});
it("list maps public booleans without exposing Auth factors",async()=>{api.invoke.mockResolvedValue({data:{users:[{id:"target",full_name:"Synthetic",email:"target@example.invalid",role_key:"manager",status:"active",mfa_configured:false,mfa_has_factors:true,created_at:"2026-10-29T12:00:00Z",last_sign_in_at:null}],roles:[]},error:null});const data=await repository.list();expect(data.users[0].mfaConfigured).toBe(false);expect(data.users[0].mfaHasFactors).toBe(true);expect(Object.keys(data.users[0])).not.toContain("factors");});
it("unknown transport failure is sanitized",async()=>{api.invoke.mockResolvedValue({data:null,error:new Error("PRIVATE_SERVER_DETAIL")});await expect(repository.resetMfa("target")).rejects.toThrow("Não foi possível concluir a ação administrativa no momento.");});
