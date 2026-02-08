import { describe, it, expect, beforeEach } from 'vitest';
import {
  Case, CaseAlreadyClosedError, CaseAlreadyCancelledError,
  CaseTaskNotFoundError, CaseInvalidStatusTransitionError,
  DocumentAlreadyAttachedError, DocumentNotAttachedError,
} from '../case';
import { CaseId } from '../CaseId';
import { CaseStatusChangedEvent } from '../CaseEvents';

describe('Case Aggregate - Additional Coverage', () => {
  let legalCase: Case;
  beforeEach(() => {
    legalCase = Case.create({ title: 'Test', description: 'D', priority: 'MEDIUM', clientId: 'c1', assignedTo: 'l1' }).value;
    legalCase.clearDomainEvents();
  });

  describe('cancel() events', () => {
    it('emits CaseStatusChangedEvent CANCELLED', () => {
      legalCase.cancel('No longer needed', 'u1');
      const events = legalCase.getDomainEvents();
      expect(events).toHaveLength(1);
      const e = events[0] as CaseStatusChangedEvent;
      expect(e.previousStatus).toBe('OPEN');
      expect(e.newStatus).toBe('CANCELLED');
    });
    it('stores reason as resolution without closedAt', () => {
      legalCase.cancel('Budget cut', 'u1');
      expect(legalCase.resolution).toBe('Budget cut');
      expect(legalCase.closedAt).toBeUndefined();
    });
  });

  describe('ops on cancelled case', () => {
    it('updateDeadline fails', () => { legalCase.cancel('R','u'); expect(legalCase.updateDeadline(new Date(),'u').isFailure).toBe(true); });
    it('changePriority fails', () => { legalCase.cancel('R','u'); expect(legalCase.changePriority('HIGH','u').isFailure).toBe(true); });
    it('addTask fails', () => { legalCase.cancel('R','u'); expect(legalCase.addTask({title:'T'},'u').isFailure).toBe(true); });
    it('removeTask fails', () => { const t=legalCase.addTask({title:'T'},'u').value.id; legalCase.cancel('R','u'); expect(legalCase.removeTask(t,'u').isFailure).toBe(true); });
    it('completeTask fails', () => { const t=legalCase.addTask({title:'T'},'u').value.id; legalCase.cancel('R','u'); expect(legalCase.completeTask(t,'u').isFailure).toBe(true); });
  });

  it('completeTask fails when already completed', () => {
    const t=legalCase.addTask({title:'T'},'u').value.id;
    legalCase.completeTask(t,'u');
    expect(legalCase.completeTask(t,'u').isFailure).toBe(true);
  });

  describe('changeStatus invalid', () => {
    it('OPEN->OPEN fails', () => { const r=legalCase.changeStatus('OPEN','u'); expect(r.isFailure).toBe(true); expect(r.error).toBeInstanceOf(CaseInvalidStatusTransitionError); });
    it('CLOSED sets closedAt', () => { legalCase.changeStatus('CLOSED','u'); expect(legalCase.closedAt).toBeDefined(); });
  });

  describe('isOverdue', () => {
    it('no deadline=false', () => { expect(legalCase.isOverdue).toBe(false); });
    it('cancelled+past=false', () => { const c=Case.create({title:'X',clientId:'c',assignedTo:'l',deadline:new Date('2020-01-01')}).value; c.cancel('C','u'); expect(c.isOverdue).toBe(false); });
  });

  describe('Documents', () => {
    it('attach ok', () => { expect(legalCase.attachDocument('d1','u').isSuccess).toBe(true); expect(legalCase.documentCount).toBe(1); });
    it('attach dup fails', () => { legalCase.attachDocument('d1','u'); expect(legalCase.attachDocument('d1','u').error).toBeInstanceOf(DocumentAlreadyAttachedError); });
    it('attach closed fails', () => { legalCase.close('D','u'); expect(legalCase.attachDocument('d1','u').isFailure).toBe(true); });
    it('attach cancelled fails', () => { legalCase.cancel('X','u'); expect(legalCase.attachDocument('d1','u').isFailure).toBe(true); });
    it('detach ok', () => { legalCase.attachDocument('d1','u'); expect(legalCase.detachDocument('d1','u').isSuccess).toBe(true); });
    it('detach missing fails', () => { expect(legalCase.detachDocument('d9','u').error).toBeInstanceOf(DocumentNotAttachedError); });
    it('detach closed fails', () => { legalCase.attachDocument('d1','u'); legalCase.close('D','u'); expect(legalCase.detachDocument('d1','u').isFailure).toBe(true); });
    it('detach cancelled fails', () => { legalCase.attachDocument('d1','u'); legalCase.cancel('X','u'); expect(legalCase.detachDocument('d1','u').isFailure).toBe(true); });
  });

  it('reconstitute with docs/closedAt', () => {
    const now=new Date();
    const c=Case.reconstitute(CaseId.generate(),{title:'F',description:'D',status:'CLOSED',priority:'URGENT',deadline:new Date('2025-06-01'),clientId:'c',assignedTo:'l',tasks:[],documentIds:['a','b'],createdAt:now,updatedAt:now,closedAt:now,resolution:'R'});
    expect(c.closedAt).toEqual(now); expect(c.resolution).toBe('R'); expect(c.documentIds).toEqual(['a','b']); expect(c.documentCount).toBe(2);
  });

  describe('toJSON full', () => {
    it('with docs/closedAt', () => { legalCase.attachDocument('d1','u'); legalCase.close('Res','u'); const j=legalCase.toJSON(); expect(j.documentIds).toEqual(['d1']); expect(j.documentCount).toBe(1); expect(j.closedAt).toBeDefined(); expect(j.resolution).toBe('Res'); });
    it('undefined fields', () => { const j=legalCase.toJSON(); expect(j.deadline).toBeUndefined(); expect(j.closedAt).toBeUndefined(); });
  });

  describe('Error messages', () => {
    it('CaseTaskNotFoundError', () => { expect(new CaseTaskNotFoundError('t1').message).toContain('t1'); });
    it('DocumentAlreadyAttachedError', () => { expect(new DocumentAlreadyAttachedError('d1').message).toContain('d1'); });
    it('DocumentNotAttachedError', () => { expect(new DocumentNotAttachedError('d1').message).toContain('d1'); });
  });
});
