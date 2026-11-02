/** Three base64url segments. Anything else cannot be a session, so it never leaves the API. */
const JWT_SHAPE = /^[\w-]+\.[\w-]+\.[\w-]+$/;

export function isJwtShaped(token: string): boolean {
  return JWT_SHAPE.test(token);
}
