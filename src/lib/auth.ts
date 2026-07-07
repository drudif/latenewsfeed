export const AUTH_COOKIE = "portal_auth";

export function isAuthed(cookieValue: string | undefined, secret: string): boolean {
  return !!cookieValue && !!secret && cookieValue === secret;
}
