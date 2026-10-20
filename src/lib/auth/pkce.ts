export function randomString(bytes = 32): string {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

function base64url(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomString(48);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(digest) };
}

/**
 * Opens an auth popup and resolves with the first message accepted by `accept`.
 * Rejects if the popup is blocked or closed before a message arrives.
 */
export function popupMessage<T>(
  url: string,
  name: string,
  accept: (event: MessageEvent) => T | undefined,
): Promise<T> {
  const popup = window.open(url, name, 'popup,width=600,height=720');
  if (!popup) {
    return Promise.reject(new Error('The sign-in window was blocked. Please allow popups for this page and try again.'));
  }
  popup.focus();

  return new Promise((resolve, reject) => {
    const closedTimer = setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(new Error('The sign-in window was closed before signing in finished.'));
      }
    }, 500);

    function onMessage(event: MessageEvent) {
      let result: T | undefined;
      try {
        result = accept(event);
      } catch (e) {
        cleanup();
        popup?.close();
        reject(e);
        return;
      }
      if (result === undefined) return;
      cleanup();
      resolve(result);
    }

    function cleanup() {
      clearInterval(closedTimer);
      window.removeEventListener('message', onMessage);
    }

    window.addEventListener('message', onMessage);
  });
}
