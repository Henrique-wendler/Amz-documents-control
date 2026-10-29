import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';
const api = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), auth: {
        onAuthStateChange: vi.fn(), signOut: vi.fn(), getSession: vi.fn(), mfa: {
            listFactors: vi.fn(), getAuthenticatorAssuranceLevel: vi.fn(), unenroll: vi.fn(), enroll: vi.fn(), challengeAndVerify: vi.fn(),
        },
    } }));
vi.mock('../src/lib/supabase', () => ({ supabase: api }));
type Factor = {
    id: string;
    factor_type: 'totp' | 'phone';
    status: 'verified' | 'unverified';
};
const factor = (id: string, status: Factor['status']): Factor => ({ id, factor_type: 'totp', status });
const stale = factor('stale-factor', 'unverified'), verified = factor('verified-factor', 'verified');
const session = { user: { id: '20000000-0000-0000-0000-000000000001' } } as Session;
let factors: Factor[], level: 'aal1' | 'aal2';
let listener: (event: AuthChangeEvent, session: Session | null) => void;
const wrapper = ({ children }: {
    children: ReactNode;
}) => <AuthProvider>{children}</AuthProvider>;
beforeEach(() => {
    vi.resetAllMocks();
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/login');
    factors = [];
    level = 'aal1';
    api.auth.onAuthStateChange.mockImplementation(callback => {
        listener = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    api.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
                    data: { id: session.user.id, full_name: 'QA User', organization_id: '10000000-0000-0000-0000-000000000001', role_key: 'manager', status: 'active' }, error: null,
                }) }) }) });
    api.auth.mfa.listFactors.mockImplementation(async () => ({ data: { all: [...factors], totp: factors.filter(f => f.factor_type === 'totp') }, error: null }));
    api.auth.mfa.getAuthenticatorAssuranceLevel.mockImplementation(async () => ({ data: { currentLevel: level, nextLevel: 'aal2' }, error: null }));
    api.auth.getSession.mockResolvedValue({ data: { session }, error: null });
    api.auth.signOut.mockResolvedValue({ error: null });
    api.auth.mfa.unenroll.mockImplementation(async ({ factorId }) => { factors = factors.filter(f => f.id !== factorId); return { error: null }; });
    api.auth.mfa.enroll.mockImplementation(async () => {
        factors.push(factor('new-factor', 'unverified'));
        return { data: { id: 'new-factor', totp: { qr_code: '<svg><title>Unit test</title></svg>', secret: 'NEW-UNIT-TEST-KEY', uri: 'otpauth://totp/UnitTest' } }, error: null };
    });
    api.auth.mfa.challengeAndVerify.mockImplementation(async ({ factorId }) => {
        factors = factors.map(f => f.id === factorId ? { ...f, status: 'verified' } : f);
        level = 'aal2';
        return { error: null };
    });
    api.rpc.mockResolvedValue({ data: [{ permission_key: 'proposal_reports.read' }], error: null });
});
const initialize = async (items: Factor[], aal: 'aal1' | 'aal2' = 'aal1', recovery = false) => {
    factors = [...items];
    level = aal;
    const hook = renderHook(useAuth, { wrapper });
    act(() => listener(recovery ? 'PASSWORD_RECOVERY' : 'SIGNED_IN', session));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    return hook;
};
describe('AuthProvider MFA classification', () => {
    it('A: zero factors requires enrollment', async () => {
        const { result } = await initialize([]);
        expect(result.current.stage).toBe('mfa_enrollment');
        expect(api.rpc).not.toHaveBeenCalled();
    });
    it('B: unverified-only requires enrollment, not a challenge', async () => {
        const { result } = await initialize([stale]);
        expect(result.current.stage).toBe('mfa_enrollment');
        expect(result.current.mfaEnrollment).toBeUndefined();
        expect(result.current.permissions).toEqual([]);
        expect(api.rpc).not.toHaveBeenCalled();
    });
    it('C: verified factor with AAL1 requires challenge', async () => {
        const { result } = await initialize([verified]);
        expect(result.current.stage).toBe('mfa_challenge');
        expect(result.current.profile).toBeNull();
        expect(api.rpc).not.toHaveBeenCalled();
    });
    it('D: verified factor with AAL2 authenticates', async () => {
        const { result } = await initialize([verified], 'aal2');
        expect(result.current.stage).toBe('authenticated');
        expect(result.current.permissions).toEqual(['proposal_reports.read']);
        expect(api.rpc).toHaveBeenCalledWith('current_user_permissions');
    });
    it('E: mixed factors challenge only the verified factor', async () => {
        const { result } = await initialize([stale, verified]);
        expect(result.current.stage).toBe('mfa_challenge');
        await act(async () => { await result.current.verifyMfaChallenge('123456'); });
        expect(api.auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: verified.id, code: '123456' });
        expect(result.current.stage).toBe('authenticated');
    });
    it('F: removes all stale TOTP factors before fresh enrollment and preserves other factor types', async () => {
        const stale2 = factor('second-stale', 'unverified');
        const phone: Factor = { id: 'phone', factor_type: 'phone', status: 'unverified' };
        const { result } = await initialize([stale, stale2, phone]);
        expect(result.current.stage).toBe('mfa_enrollment');
        await act(async () => { expect((await result.current.startMfaEnrollment()).success).toBe(true); });
        expect(api.auth.mfa.unenroll.mock.calls).toEqual([[{ factorId: stale.id }], [{ factorId: stale2.id }]]);
        expect(Math.max(...api.auth.mfa.unenroll.mock.invocationCallOrder)).toBeLessThan(api.auth.mfa.enroll.mock.invocationCallOrder[0]);
        expect(factors.map(f => f.id)).toEqual(['phone', 'new-factor']);
        expect(result.current.mfaEnrollment).toEqual({ factorId: 'new-factor', secret: 'NEW-UNIT-TEST-KEY', qrCode: expect.stringMatching(/^data:image\/svg\+xml;utf-8,/) });
        expect(api.auth.mfa.challengeAndVerify).not.toHaveBeenCalled();
        expect(api.rpc).not.toHaveBeenCalled();
    });
    it('G: valid enrollment verification produces verified TOTP, AAL2 and authenticated state', async () => {
        const { result } = await initialize([stale]);
        await act(async () => { await result.current.startMfaEnrollment(); });
        expect(result.current.stage).toBe('mfa_enrollment');
        expect(level).toBe('aal1');
        expect(factors).toEqual([factor('new-factor', 'unverified')]);
        expect(api.rpc).not.toHaveBeenCalled();
        await act(async () => { expect((await result.current.verifyMfaEnrollment('123456')).success).toBe(true); });
        expect(factors).toEqual([factor('new-factor', 'verified')]);
        expect(level).toBe('aal2');
        expect(result.current.stage).toBe('authenticated');
        expect(result.current.mfaEnrollment).toBeUndefined();
        expect(api.auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'new-factor', code: '123456' });
        expect(api.rpc).toHaveBeenCalledTimes(1);
    });
    it('invalid verification never grants authenticated access', async () => {
        const { result } = await initialize([]);
        await act(async () => { await result.current.startMfaEnrollment(); });
        api.auth.mfa.challengeAndVerify.mockResolvedValueOnce({ error: { message: 'Invalid test code' } });
        await act(async () => { expect((await result.current.verifyMfaEnrollment('000000')).success).toBe(false); });
        expect(result.current.stage).toBe('mfa_enrollment');
        expect(level).toBe('aal1');
        expect(factors[0].status).toBe('unverified');
        expect(api.rpc).not.toHaveBeenCalled();
    });
});
describe('password recovery retains verified-only semantics', () => {
    it.each([['zero factors', []], ['unverified-only', [stale]], ['multiple unverified', [stale, factor('other-stale', 'unverified')]]] as const)('does not challenge %s', async (_name, items) => {
        const { result } = await initialize([...items], 'aal1', true);
        expect(result.current.stage).toBe('password_recovery');
        expect(result.current.passwordRecoveryStatus).toBe('ready');
        expect(result.current.passwordRecoveryMfaRequired).toBe(false);
        expect(api.auth.mfa.challengeAndVerify).not.toHaveBeenCalled();
        expect(api.rpc).not.toHaveBeenCalled();
    });
    it('challenges only the verified recovery factor at AAL1', async () => {
        const { result } = await initialize([stale, verified], 'aal1', true);
        expect(result.current.passwordRecoveryMfaRequired).toBe(true);
        await act(async () => { expect((await result.current.verifyPasswordRecoveryMfa('123456')).success).toBe(true); });
        expect(api.auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: verified.id, code: '123456' });
        expect(result.current.stage).toBe('password_recovery');
        expect(result.current.passwordRecoveryMfaRequired).toBe(false);
        expect(api.rpc).not.toHaveBeenCalled();
    });
    it('does not repeat the recovery challenge at AAL2', async () => {
        const { result } = await initialize([stale, verified], 'aal2', true);
        expect(result.current.passwordRecoveryStatus).toBe('ready');
        expect(result.current.passwordRecoveryMfaRequired).toBe(false);
        expect(api.auth.mfa.challengeAndVerify).not.toHaveBeenCalled();
        expect(api.rpc).not.toHaveBeenCalled();
    });
});

it('administrative reset then normal login returns to enrollment with a new factor', async () => {
    const {result}=await initialize([verified], 'aal2');
    expect(result.current.stage).toBe('authenticated');
    act(()=>listener('SIGNED_OUT',null));
    factors=[]; level='aal1';
    act(()=>listener('SIGNED_IN',session));
    await waitFor(()=>expect(result.current.stage).toBe('mfa_enrollment'));
    expect(result.current.permissions).toEqual([]);
    await act(async()=>{await result.current.startMfaEnrollment();});
    expect(factors).toEqual([factor('new-factor','unverified')]);
    expect(result.current.mfaEnrollment?.secret).toBe('NEW-UNIT-TEST-KEY');
    await act(async()=>{await result.current.verifyMfaEnrollment('123456');});
    expect(result.current.stage).toBe('authenticated');
    expect(level).toBe('aal2');
    expect(result.current.mfaEnrollment).toBeUndefined();
});
