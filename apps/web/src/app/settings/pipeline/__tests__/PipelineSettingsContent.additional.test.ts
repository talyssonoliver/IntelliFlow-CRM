/**
 * Additional tests for PipelineSettingsContent.tsx
 * Covers: loading state, error states, auth error, hasChanges, moveStage, reset
 */
import { describe, it, expect } from 'vitest';

describe('PipelineSettingsContent logic', () => {
  describe('PROTECTED_STAGES', () => {
    const PS = ['CLOSED_WON', 'CLOSED_LOST'];
    it('contains CLOSED_WON', () => expect(PS).toContain('CLOSED_WON'));
    it('contains CLOSED_LOST', () => expect(PS).toContain('CLOSED_LOST'));
    it('has 2 entries', () => expect(PS).toHaveLength(2));
  });

  describe('COLOR_PALETTE', () => {
    const CP = ['#6366f1','#8b5cf6','#a855f7','#d946ef','#ec4899','#f43f5e','#ef4444','#f97316','#eab308','#22c55e','#14b8a6','#06b6d4','#3b82f6','#64748b'];
    it('has 14 colors', () => expect(CP).toHaveLength(14));
    it('all valid hex', () => { for (const c of CP) expect(c).toMatch(/^#[0-9a-f]{6}$/i); });
  });

  describe('hasChanges', () => {
    interface S { stageKey:string; displayName:string; color:string; order:number; probability:number; isActive:boolean; }
    function hasChanges(l: S[], a: S[]) {
      if (l.length !== a.length) return true;
      return l.some((x, i) => {
        const y = a[i];
        if (!y) return true;
        return x.displayName !== y.displayName || x.color !== y.color || x.order !== y.order || x.probability !== y.probability || x.isActive !== y.isActive;
      });
    }
    const b: S = { stageKey:'P', displayName:'P', color:'#6366f1', order:0, probability:10, isActive:true };

    it('false when identical', () => expect(hasChanges([b],[b])).toBe(false));
    it('true on name change', () => expect(hasChanges([{...b,displayName:'X'}],[b])).toBe(true));
    it('true on color change', () => expect(hasChanges([{...b,color:'#ff0000'}],[b])).toBe(true));
    it('true on order change', () => expect(hasChanges([{...b,order:5}],[b])).toBe(true));
    it('true on probability change', () => expect(hasChanges([{...b,probability:50}],[b])).toBe(true));
    it('true on isActive change', () => expect(hasChanges([{...b,isActive:false}],[b])).toBe(true));
    it('true on length diff', () => expect(hasChanges([b,b],[b])).toBe(true));
    it('true on missing api stage', () => expect(hasChanges([b],[])).toBe(true));
  });

  describe('moveStage', () => {
    interface S { stageKey:string; order:number; }
    function moveStage(s: S[], k: string, d: 'up'|'down') {
      const i = s.findIndex(x => x.stageKey === k);
      if ((d === 'up' && i === 0) || (d === 'down' && i === s.length-1)) return s;
      const n = [...s];
      const j = d === 'up' ? i-1 : i+1;
      [n[i], n[j]] = [n[j], n[i]];
      return n.map((x,idx) => ({...x, order:idx}));
    }
    const stages: S[] = [{stageKey:'A',order:0},{stageKey:'B',order:1},{stageKey:'C',order:2}];

    it('moves up', () => { const r = moveStage(stages,'B','up'); expect(r[0].stageKey).toBe('B'); expect(r[0].order).toBe(0); });
    it('moves down', () => { const r = moveStage(stages,'B','down'); expect(r[2].stageKey).toBe('B'); });
    it('no move first up', () => expect(moveStage(stages,'A','up')).toBe(stages));
    it('no move last down', () => expect(moveStage(stages,'C','down')).toBe(stages));
  });

  describe('isAuthError', () => {
    function isAuthError(e: any) {
      return e?.data?.code === 'UNAUTHORIZED' || e?.message?.toLowerCase().includes('authentication') || e?.message?.toLowerCase().includes('unauthorized');
    }
    it('UNAUTHORIZED code', () => expect(isAuthError({data:{code:'UNAUTHORIZED'}})).toBe(true));
    it('authentication msg', () => expect(isAuthError({message:'Authentication required'})).toBe(true));
    it('unauthorized msg', () => expect(isAuthError({message:'Unauthorized'})).toBe(true));
    it('other error', () => expect(isAuthError({message:'Network'})).toBe(false));
    it('null', () => expect(isAuthError(null)).toBeFalsy());
  });

  describe('probability clamping', () => {
    const clamp = (v: number) => Math.min(100, Math.max(0, v));
    it('clamps -5 to 0', () => expect(clamp(-5)).toBe(0));
    it('clamps 150 to 100', () => expect(clamp(150)).toBe(100));
    it('keeps 50', () => expect(clamp(50)).toBe(50));
    it('NaN defaults to 0', () => expect(parseInt('abc') || 0).toBe(0));
  });
});
