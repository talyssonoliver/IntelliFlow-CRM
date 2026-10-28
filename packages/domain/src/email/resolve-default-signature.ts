export interface DefaultableSignature {
  isDefault: boolean;
}

/**
 * The signature prefilled in a new message (owner ruling Q5): the user's
 * default, else the organisation's default, else none.
 */
export function resolveDefaultSignature<S extends DefaultableSignature>(
  userSignatures: readonly S[],
  orgSignatures: readonly S[]
): S | null {
  return userSignatures.find((s) => s.isDefault) ?? orgSignatures.find((s) => s.isDefault) ?? null;
}
