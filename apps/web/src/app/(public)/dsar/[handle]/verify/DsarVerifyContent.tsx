'use client';

/**
 * Confirms a data request from the emailed link (PG-203 DSAR, spec Addendum A).
 *
 * The link's fragment is read once into a ref and stripped from the address bar before
 * anything else happens; StrictMode's second effect run reads the ref, not the URL, and the
 * confirmation is sent once. The page shows the request type and the date the firm must
 * answer by. For a copy of the data, the download link arrives by email: the token for it
 * never comes back to the browser.
 */
import { useEffect, useRef, useState } from 'react';
import type { DsarVerifyResultDto } from '@intelliflow/validators/dsar';
import { trpc } from '@/lib/trpc';
import {
  DSAR_TYPE_COPY,
  DsarNotice,
  dueDateLabel,
  errorCode,
  takeDsarFragment,
  type DsarLink,
} from '../../dsar-shared';

type State =
  | { kind: 'working' }
  | { kind: 'missing' }
  | { kind: 'invalid' }
  | { kind: 'busy' }
  | { kind: 'done'; result: DsarVerifyResultDto };

export default function DsarVerifyContent() {
  // mutateAsync is stable across renders, and `sent` makes the confirmation run once.
  const { mutateAsync: confirmRequest } = trpc.privacy.verify.useMutation();
  const link = useRef<DsarLink | null | undefined>(undefined);
  const sent = useRef(false);
  const [state, setState] = useState<State>({ kind: 'working' });

  useEffect(() => {
    if (link.current === undefined) link.current = takeDsarFragment();
    if (sent.current) return;
    sent.current = true;
    const current = link.current;
    if (!current) {
      setState({ kind: 'missing' });
      return;
    }
    confirmRequest(current)
      .then((result) => setState({ kind: 'done', result }))
      .catch((error: unknown) =>
        setState({ kind: errorCode(error) === 'TOO_MANY_REQUESTS' ? 'busy' : 'invalid' })
      );
  }, [confirmRequest]);

  switch (state.kind) {
    case 'working':
      return (
        <DsarNotice title="Confirming your request">
          <output>Please wait</output>
        </DsarNotice>
      );
    case 'missing':
      return (
        <DsarNotice title="This link is incomplete">
          <p>Open the link from the email again, in full, or make a new request.</p>
        </DsarNotice>
      );
    case 'busy':
      return (
        <DsarNotice title="Please try again shortly">
          <p>Too many attempts from here just now. Open the link from the email again later.</p>
        </DsarNotice>
      );
    case 'invalid':
      return (
        <DsarNotice title="This link is invalid or has expired">
          <p>
            Links work once, for 24 hours. If you still need the firm to act, make a new request.
          </p>
        </DsarNotice>
      );
    case 'done': {
      const { result } = state;
      return (
        <DsarNotice title="Your request is confirmed">
          <p className="text-foreground">{DSAR_TYPE_COPY[result.type].label}</p>
          <p>{`The firm must respond by ${dueDateLabel(result.dueDate)}.`}</p>
          {result.exportEmailed && (
            <p>
              We have emailed you a link to download your data. Keep that email private: anyone with
              the link can use it.
            </p>
          )}
          <p>
            If you are not satisfied with how your request is handled, you can complain to the
            Information Commissioner’s Office (ico.org.uk).
          </p>
        </DsarNotice>
      );
    }
  }
}
