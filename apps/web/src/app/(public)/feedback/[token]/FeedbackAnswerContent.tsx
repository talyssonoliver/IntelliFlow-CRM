'use client';

/**
 * The survey answer screen (MVP-012): one question, a row of numbers, an optional comment, send.
 * The server decides everything (valid, used, expired, score range); this component only explains.
 * It shows the company name and nothing else about who sent the survey.
 */
import { useState } from 'react';
import { Button, Label, Textarea } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';

type SurveyType = 'NPS' | 'CSAT';

const SCALES: Record<SurveyType, { min: number; max: number; low: string; high: string }> = {
  NPS: { min: 0, max: 10, low: 'Not at all likely', high: 'Extremely likely' },
  CSAT: { min: 1, max: 5, low: 'Very unhappy', high: 'Very happy' },
};

export function questionFor(type: SurveyType, company: string): string {
  return type === 'NPS'
    ? `How likely are you to recommend ${company} to a friend or colleague?`
    : `How satisfied are you with your recent experience with ${company}?`;
}

const MESSAGES: Record<string, string> = {
  invalid: 'This survey link is not valid.',
  expired: 'This survey link has expired.',
  used: 'This survey has already been answered. Thank you.',
};

function Shell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-xl flex-col justify-center px-4 py-10">
      <div className="rounded-xl border bg-card p-6 shadow-sm sm:p-8">{children}</div>
    </main>
  );
}

export default function FeedbackAnswerContent({ token }: Readonly<{ token: string }>) {
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const lookup = trpc.publicSurvey.get.useQuery({ token }, { retry: false });
  const submit = trpc.publicSurvey.submit.useMutation();

  if (lookup.isLoading) {
    return (
      <Shell>
        <p className="text-muted-foreground">Loading...</p>
      </Shell>
    );
  }
  if (lookup.error || !lookup.data) {
    return (
      <Shell>
        <p role="alert">Something went wrong. Please try again in a moment.</p>
      </Shell>
    );
  }
  if (submit.data?.status === 'ok') {
    return (
      <Shell>
        <h1 className="text-xl font-semibold">Thank you</h1>
        <p className="mt-2 text-muted-foreground">Your answer has been sent.</p>
      </Shell>
    );
  }
  if (lookup.data.status !== 'ok') {
    return (
      <Shell>
        <p>{MESSAGES[lookup.data.status]}</p>
      </Shell>
    );
  }

  const { surveyType, companyName } = lookup.data;
  const scale = SCALES[surveyType];
  const values = Array.from({ length: scale.max - scale.min + 1 }, (_, i) => scale.min + i);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (score === null) return;
    setFailure(null);
    try {
      const result = await submit.mutateAsync({
        token,
        score,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      });
      if (result.status !== 'ok') {
        setFailure(MESSAGES[result.status] ?? 'Please pick one of the numbers.');
      }
    } catch {
      setFailure('We could not send your answer. Please try again in a moment.');
    }
  };

  return (
    <Shell>
      <form onSubmit={onSubmit} className="space-y-6">
        <h1 className="text-xl font-semibold">{questionFor(surveyType, companyName)}</h1>
        <fieldset>
          <legend className="sr-only">Your answer</legend>
          <div className="flex flex-wrap gap-2">
            {values.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={score === value}
                onClick={() => setScore(value)}
                className={`h-11 w-11 rounded-md border text-sm font-medium transition-colors ${
                  score === value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-background hover:bg-accent'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>{scale.low}</span>
            <span>{scale.high}</span>
          </div>
        </fieldset>
        <div className="space-y-2">
          <Label htmlFor="survey-comment">Anything you would like to add? (optional)</Label>
          <Textarea
            id="survey-comment"
            value={comment}
            maxLength={2000}
            rows={4}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>
        {failure && (
          <p role="alert" className="text-sm text-destructive">
            {failure}
          </p>
        )}
        <Button type="submit" disabled={score === null || submit.isPending}>
          {submit.isPending ? 'Sending...' : 'Send answer'}
        </Button>
      </form>
    </Shell>
  );
}
