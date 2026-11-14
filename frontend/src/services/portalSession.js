
const SESSION_KEY = "fashion_portal_login";

export function getPortalSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);

    if (!raw) {
      return null;
    }

    const session = JSON.parse(raw);

    if (
      !session.access_token ||
      !Number.isFinite(session.expires_at) ||
      Date.now() >= session.expires_at
    ) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }

    return session;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function savePortalSession(response) {
  const expiresIn = Number(response.expires_in);

  if (
    !response.access_token ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0
  ) {
    throw new Error("Invalid authentication response.");
  }

  const session = {
    access_token: response.access_token,
    username: response.username,
    expires_at: Date.now() + expiresIn * 1000,
  };

  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify(session)
  );

  return session;
}

export function clearPortalSession() {
  sessionStorage.removeItem(SESSION_KEY);
}
