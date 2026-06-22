export type AuthResult =
  | { ok: true; grantedScopes: readonly string[] }
  | { ok: false; response: Response };
