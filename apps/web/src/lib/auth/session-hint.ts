/**
 * Public pages are prerendered, so the server cannot know who is asking. This
 * script runs before first paint and marks `<html>` when an access-token cookie
 * is present; `aurora-site.css` then hides the public header and footer while the
 * client is still resolving the session. It is a display hint only.
 */
export const SESSION_HINT_ATTRIBUTE = 'data-session-hint';

export const SESSION_HINT_SCRIPT = `if(/(?:^|; )accessToken=[^;]/.test(document.cookie))document.documentElement.setAttribute('${SESSION_HINT_ATTRIBUTE}','')`;
