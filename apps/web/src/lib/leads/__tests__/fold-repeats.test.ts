import { describe, it, expect } from 'vitest';
import { foldRepeats, repeatKey, threadSubject } from '../fold-repeats';

const a = (
  id: string,
  type: string,
  title: string,
  user = 'Talysson Oliveira',
  insightType?: string
) => ({
  id,
  type,
  title,
  user,
  metadata: insightType ? { insightType } : null,
});

describe('foldRepeats (owner 21/11: same information, same lead)', () => {
  it('keeps the newest AI insight and folds the earlier ones of that type under it', () => {
    const list = [
      a(
        '3',
        'qualification',
        'Northfield Plumbing is qualified and ready to move',
        'AI Insights',
        'opportunity'
      ),
      a('call', 'call', 'Call with Robert'),
      a(
        '2',
        'qualification',
        'Northfield Plumbing is a qualified lead close to hot',
        'AI Insights',
        'opportunity'
      ),
      a(
        '1',
        'qualification',
        'Northfield Plumbing is a qualified lead close to hot',
        'AI Insights',
        'opportunity'
      ),
    ];
    const folded = foldRepeats(list);
    expect(folded.map((g) => [g.head.id, g.previous.map((p) => p.id)])).toEqual([
      ['3', ['2', '1']],
      ['call', []],
    ]);
  });

  it('never folds AI insights of different kinds together (codex 27/11)', () => {
    const list = [
      a('r', 'score_update', 'Follow up this week', 'AI Insights', 'recommendation'),
      a('w', 'score_update', 'Engagement is dropping', 'AI Insights', 'warning'),
      a('r0', 'score_update', 'Call them back', 'AI Insights', 'recommendation'),
    ];
    expect(foldRepeats(list).map((g) => [g.head.id, g.previous.map((p) => p.id)])).toEqual([
      ['r', ['r0']],
      ['w', []],
    ]);
  });

  it('folds an AI entry without a kind only with the same title', () => {
    const list = [
      a('x2', 'score_update', 'Score changed', 'AI Insights'),
      a('y', 'score_update', 'Something else', 'AI Insights'),
      a('x1', 'score_update', 'Score changed', 'AI Insights'),
    ];
    expect(foldRepeats(list).map((g) => g.previous.map((p) => p.id))).toEqual([['x1'], []]);
  });

  it('folds an email thread by subject, ignoring Re: and Fwd:', () => {
    const list = [
      a('e3', 'email', 'Re: Re: Helping Northfield Plumbing win more jobs'),
      a('e2', 'email', 'RE: Helping Northfield Plumbing win more jobs'),
      a('e1', 'email', 'Helping Northfield Plumbing win more jobs'),
      a('e0', 'email', 'Your launch brief'),
    ];
    expect(foldRepeats(list).map((g) => [g.head.id, g.previous.length])).toEqual([
      ['e3', 2],
      ['e0', 0],
    ]);
  });

  it('never folds people’s own notes, calls or meetings', () => {
    const list = [a('n2', 'note', 'Called back'), a('n1', 'note', 'Called back')];
    expect(foldRepeats(list)).toHaveLength(2);
    expect(repeatKey(list[0])).toBeNull();
  });

  it('normalises a thread subject', () => {
    expect(threadSubject('  Fwd:  RE:   Hello   There ')).toBe('hello there');
  });
});
