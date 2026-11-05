import { Fragment } from 'react';

/** Lets a long address wrap after the @ or before a dot, rather than in the middle of a word. */
export function BreakableAddress({ address }: Readonly<{ address: string }>) {
  let offset = 0;
  return (
    <>
      {address.split(/(?<=@)|(?=\.)/).map((part) => {
        const start = offset;
        offset += part.length;
        return (
          <Fragment key={start}>
            {start > 0 && <wbr />}
            {part}
          </Fragment>
        );
      })}
    </>
  );
}
