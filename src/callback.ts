import { CALLBACK_MESSAGE_SOURCE, type CallbackMessage } from './lib/auth/github';

// GitHub redirects the sign-in popup here; hand the result back to the wizard
const params = new URLSearchParams(location.search);
const message: CallbackMessage = {
  source: CALLBACK_MESSAGE_SOURCE,
  code: params.get('code') ?? undefined,
  state: params.get('state') ?? undefined,
  error: params.get('error') ?? undefined,
  errorDescription: params.get('error_description') ?? undefined,
};

if (window.opener) {
  window.opener.postMessage(message, location.origin);
  window.close();
} else {
  document.getElementById('status')!.textContent =
    'This page should have opened as a sign-in window. Please close it and try signing in again.';
}
