import { HttpErrorResponse } from '@angular/common/http';
import { startAuthentication, startRegistration, type PublicKeyCredentialCreationOptionsJSON, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import type { Api } from '../api/generated/api';
import { passkeysControllerAdd } from '../api/generated/fn/auth/passkeys-controller-add';
import { passkeysControllerAddOptions } from '../api/generated/fn/auth/passkeys-controller-add-options';
import { passkeysControllerSignIn } from '../api/generated/fn/auth/passkeys-controller-sign-in';
import { passkeysControllerSignInOptions } from '../api/generated/fn/auth/passkeys-controller-sign-in-options';
import { passkeysControllerSignUp } from '../api/generated/fn/auth/passkeys-controller-sign-up';
import { passkeysControllerSignUpOptions } from '../api/generated/fn/auth/passkeys-controller-sign-up-options';
import type { PasskeyDto } from '../api/generated/models/passkey-dto';
import type { SessionDto } from '../api/generated/models/session-dto';

/** A name for a passkey made on this device: "Chrome on Mac". */
export function deviceLabel(ua = navigator.userAgent): string {
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /iPhone|iPad/.test(ua) ? 'iPhone or iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}

/** Signs in with any of this site's passkeys the browser has. */
export async function signInWithPasskey(api: Api): Promise<SessionDto> {
  const { challengeId, options } = await api.invoke(passkeysControllerSignInOptions);
  const response = await startAuthentication({ optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON });
  return api.invoke(passkeysControllerSignIn, { body: { challengeId, response: response as unknown as Record<string, unknown> } });
}

/** Makes an account and its first passkey, and signs in. */
export async function signUpWithPasskey(api: Api, name: string, email: string): Promise<SessionDto> {
  const { challengeId, options } = await api.invoke(passkeysControllerSignUpOptions, { body: { name, email, label: deviceLabel() } });
  const response = await startRegistration({ optionsJSON: options as unknown as PublicKeyCredentialCreationOptionsJSON });
  return api.invoke(passkeysControllerSignUp, { body: { challengeId, response: response as unknown as Record<string, unknown> } });
}

/** Adds a passkey on this device to the signed-in person's account. */
export async function addPasskey(api: Api, label = deviceLabel()): Promise<PasskeyDto> {
  const { challengeId, options } = await api.invoke(passkeysControllerAddOptions, { body: { label } });
  const response = await startRegistration({ optionsJSON: options as unknown as PublicKeyCredentialCreationOptionsJSON });
  return api.invoke(passkeysControllerAdd, { body: { challengeId, response: response as unknown as Record<string, unknown> } });
}

/** What to tell someone when a passkey step fails. */
export function passkeyProblem(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    const message = (err.error as { message?: unknown } | null)?.message;
    if (typeof message === 'string') return message;
    if (err.status === 0) return "Corkboard couldn't be reached. Check your connection.";
  }
  const name = (err as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'AbortError') return 'The passkey prompt was closed. Try again when you’re ready.';
  if (name === 'InvalidStateError') return 'This device already has a passkey for that account.';
  return "That didn't work. Try again.";
}
