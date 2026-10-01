'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { rememberSignupEmail } from '@/lib/signup-prefill';

/**
 * One field, one button: the shortest path to the trial. The email goes to the
 * sign-up form through sessionStorage, never in the address bar. Without
 * JavaScript the form still opens sign-up (the field has no name, so nothing
 * is sent).
 */
export function StartFreeForm() {
  const router = useRouter();
  const [email, setEmail] = React.useState('');

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    rememberSignupEmail(email);
    router.push('/signup');
  };

  return (
    <form className="final-form" action="/signup" method="get" onSubmit={onSubmit}>
      <label htmlFor="final-email" className="sr-only">
        Work email
      </label>
      <input
        id="final-email"
        type="email"
        placeholder="Your work email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button type="submit" className="btn btn-primary">
        Start free
      </button>
    </form>
  );
}
