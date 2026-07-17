const LIVE_TOKEN_URL = 'https://api-m.paypal.com/v1/oauth2/token';
const SANDBOX_TOKEN_URL = 'https://api-m.sandbox.paypal.com/v1/oauth2/token';

async function requestToken(url, clientId, secret) {
  const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/* Verifies PayPal credentials live against the real PayPal API as soon as
   an admin saves them in the admin panel, instead of letting them fail
   silently on the first real order. Also detects the common mistake of
   entering sandbox instead of live credentials and returns a concrete,
   actionable error message. */
export async function verifyPaypalCredentials(clientId, secret) {
  if (!clientId || !secret) {
    return { verified: false, error: 'Client ID or secret is missing.', solution: 'Please fill in both fields.' };
  }

  try {
    const live = await requestToken(LIVE_TOKEN_URL, clientId, secret);
    if (live.ok) {
      return { verified: true };
    }

    if (live.status === 401) {
      const sandbox = await requestToken(SANDBOX_TOKEN_URL, clientId, secret);
      if (sandbox.ok) {
        return {
          verified: false,
          error: 'These are sandbox (test account) credentials, not live credentials.',
          solution: 'In the PayPal Developer Dashboard, switch to "Live" in the top right, create an app there if none exists yet, and enter the Live Client ID + Live Secret here.',
        };
      }
      return {
        verified: false,
        error: 'PayPal rejected the credentials (wrong Client ID or Secret).',
        solution: 'Copy the Client ID and Secret again from the PayPal Developer Dashboard (developer.paypal.com -> My Apps & Credentials -> Live) and paste them here.',
      };
    }

    return {
      verified: false,
      error: `PayPal responded with error ${live.status}.`,
      solution: 'Wait a moment and save again. If the error persists, check status.paypal.com.',
    };
  } catch (err) {
    return {
      verified: false,
      error: 'PayPal was unreachable (network error): ' + err.message,
      solution: 'Check the server\'s internet connection and save again.',
    };
  }
}
