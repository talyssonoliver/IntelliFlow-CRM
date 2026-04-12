const AVATAR_PROXY_HOST_SUFFIXES = [
  'googleusercontent.com',
  'ggpht.com',
  'dicebear.com',
  'avatars.githubusercontent.com',
  'githubusercontent.com',
  'gravatar.com',
  'unsplash.com',
] as const;

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function isAvatarImageSource(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  return /^https?:\/\//i.test(trimmed) || /^data:image\//i.test(trimmed) || trimmed.startsWith('/');
}

export function isProxyableAvatarHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return AVATAR_PROXY_HOST_SUFFIXES.some(
    (suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`)
  );
}

/**
 * Returns an avatar source safe for repeated rendering in the UI.
 *
 * For known third-party avatar hosts, this routes through a local proxy endpoint
 * so repeated renders don't hammer provider URLs directly.
 */
export function normalizeAvatarSource(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (!isHttpUrl(trimmed)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);

    if (isProxyableAvatarHost(parsed.hostname)) {
      return `/api/avatar-proxy?src=${encodeURIComponent(trimmed)}`;
    }

    return trimmed;
  } catch {
    return trimmed;
  }
}
