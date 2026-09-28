import { Platform } from 'react-native';
import * as SMS from 'expo-sms';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

export const SHARE_RESULT = {
  NOT_AVAILABLE: 'NOT_AVAILABLE',
  USER_CANCELLED: 'USER_CANCELLED',
  COMPOSER_OPENED: 'COMPOSER_OPENED',
  SHARE_SHEET_OPENED: 'SHARE_SHEET_OPENED',
  ERROR: 'ERROR',
};

/**
 * Write the alert text to a cache file and return its URI.
 *
 * Uses the current expo-file-system API (`File` + `Paths`). The previous code
 * called `FileSystem.cacheDirectory` and `FileSystem.writeAsStringAsync`, both
 * of which were removed in SDK 54 - this project is on ~57, so they were
 * `undefined` and the share silently reported success without opening.
 */
async function writeAlertFile(message) {
  try {
    if (typeof FileSystem.File === 'function' && FileSystem.Paths?.cache) {
      const file = new FileSystem.File(FileSystem.Paths.cache, 'safeher-sos-alert.txt');
      if (file.exists) file.delete();
      file.create();
      file.write(message);
      return file.uri;
    }
  } catch {
    /* fall through */
  }
  return null;
}

function extractPhoneList(contacts) {
  if (!Array.isArray(contacts)) return [];
  return contacts
    .map((c) => c?.phone)
    .filter((p) => p && typeof p === 'string' && p.replace(/\D/g, '').length >= 6);
}

export async function sendEmergencySMS(message, contacts) {
  const phones = extractPhoneList(contacts);

  if (Platform.OS === 'web') {
    // Previously reported COMPOSER_OPENED (or even SHARE_SHEET_OPENED with no
    // contacts) regardless of whether `window.location` existed, so the UI
    // claimed an SMS composer opened when nothing happened. Use a real anchor
    // click so the current page is not navigated away, and report honestly.
    const first = phones[0];
    const smsUrl = first
      ? `sms:${first}?body=${encodeURIComponent(message)}`
      : `sms:?body=${encodeURIComponent(message)}`;

    if (typeof document === 'undefined') {
      return {
        status: SHARE_RESULT.NOT_AVAILABLE,
        detail: 'SMS links are not supported in this environment.',
      };
    }
    try {
      const a = document.createElement('a');
      a.href = smsUrl;
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return {
        status: SHARE_RESULT.COMPOSER_OPENED,
        detail: phones.length
          ? 'SMS link opened — user action required to send.'
          : 'No contacts saved, so no recipient was prefilled.',
      };
    } catch {
      return {
        status: SHARE_RESULT.ERROR,
        detail: 'Could not open an SMS composer.',
      };
    }
  }

  try {
    const isAvailable = await SMS.isAvailableAsync();
    if (!isAvailable) {
      return {
        status: SHARE_RESULT.NOT_AVAILABLE,
        detail: 'SMS is not available on this device. Use Share instead.',
      };
    }
    const result = await SMS.sendSMSAsync(phones, message);
    if (result && result.result === 'sent') {
      return {
        status: SHARE_RESULT.COMPOSER_OPENED,
        detail: 'SMS composer closed — user action completed.',
      };
    }
    if (result && result.result === 'cancelled') {
      return {
        status: SHARE_RESULT.USER_CANCELLED,
        detail: 'SMS cancelled by user.',
      };
    }
    return {
      status: SHARE_RESULT.COMPOSER_OPENED,
      detail: 'Message prepared in SMS composer — user action required.',
    };
  } catch (err) {
    return {
      status: SHARE_RESULT.ERROR,
      detail: err?.message || 'Could not open SMS composer.',
    };
  }
}

export async function shareEmergencyAlert(message, title) {
  if (Platform.OS === 'web') {
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: title || 'Safe-Her SOS', text: message });
        return {
          status: SHARE_RESULT.SHARE_SHEET_OPENED,
          detail: 'Share sheet closed — user action completed.',
        };
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(message);
        return {
          status: SHARE_RESULT.SHARE_SHEET_OPENED,
          detail: 'Emergency alert copied to clipboard. Paste to share with contacts.',
        };
      }
      return {
        status: SHARE_RESULT.NOT_AVAILABLE,
        detail: 'Share not available on this browser.',
      };
    } catch (err) {
      if (err?.name === 'AbortError') {
        return {
          status: SHARE_RESULT.USER_CANCELLED,
          detail: 'Share cancelled by user.',
        };
      }
      return {
        status: SHARE_RESULT.ERROR,
        detail: err?.message || 'Could not share alert.',
      };
    }
  }

  try {
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      return {
        status: SHARE_RESULT.NOT_AVAILABLE,
        detail: 'Share is not available on this device.',
      };
    }
    // expo-file-system moved to the `File`/`Paths` API in SDK 54; the legacy
    // top-level `cacheDirectory` / `writeAsStringAsync` / `EncodingType`
    // exports no longer exist. This project is on expo-file-system ~57, so the
    // old names were undefined: the write was skipped and the function
    // returned SHARE_SHEET_OPENED anyway, claiming success when nothing opened.
    const tmpFile = await writeAlertFile(message);

    if (tmpFile) {
      try {
        await Sharing.shareAsync(tmpFile, {
          mimeType: 'text/plain',
          dialogTitle: title || '🚨 Safe-Her Emergency Alert',
          UTI: 'public.plain-text',
        });
        return {
          status: SHARE_RESULT.SHARE_SHEET_OPENED,
          detail: 'Share sheet opened — user action required.',
        };
      } catch {
        // fall through to clipboard / SMS fallback
      }
    }

    return {
      status: SHARE_RESULT.NOT_AVAILABLE,
      detail: 'Could not create a file to share on this device.',
    };
  } catch (err) {
    return {
      status: SHARE_RESULT.ERROR,
      detail: err?.message || 'Could not open share sheet.',
    };
  }
}
