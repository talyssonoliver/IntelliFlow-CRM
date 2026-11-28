'use client';

import type { ComponentProps } from 'react';
import PublicError from '@/app/(public)/error';

export default function SignedInHomeError(props: Readonly<ComponentProps<typeof PublicError>>) {
  return <PublicError {...props} />;
}
