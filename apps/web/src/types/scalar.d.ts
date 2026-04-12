declare module '@scalar/api-reference-react' {
  import type { FC } from 'react';
  export const ApiReferenceReact: FC<{ configuration: Record<string, unknown> }>;
}

declare module '@scalar/api-reference-react/style.css' {
  const content: Record<string, string>;
  export default content;
}
