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

function extractPhoneList(contacts) {
  if (!Array.isArray(contacts)) return [];
  return contacts
    .map((c) => c?.phone)
    .filter((p) => p && typeof p === 'string' && p.replace(/\D/g, '').length >= 6);
}

export async function sendEmergencySMS(message, contacts) {
  const phones = extractPhoneList(contacts);

  if (Platform.OS === 'web') {
    const urlPhones = phones.length
      ? phones
      : [''];
    const first = urlPhones[0];
    const smsUrl = first ? `sms:${first}?body=${encodeURIComponent(message)}` : `sms:?body=${encodeURIComponent(message)}`;
    try {
      if (typeof window !== 'undefined' && window.location) {
        window.location.href = smsUrl;
      }
    } catch {}
    return {
      status: phones.length ? SHARE_RESULT.COMPOSER_OPENED : SHARE_RESULT.SHARE_SHEET_OPENED,
      detail: 'SMS link opened — user action required to send.',
    };
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
    const tmpFile = FileSystem?.cacheDirectory ? `${FileSystem.cacheDirectory}safeher-sos-alert.txt` : null;
    if (tmpFile) {
      try {
        await FileSystem.writeAsStringAsync(tmpFile, message, { encoding: FileSystem.EncodingType.UTF8 });
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
      status: SHARE_RESULT.SHARE_SHEET_OPENED,
      detail: 'Share sheet opened — user action required.',
    };
  } catch (err) {
    return {
      status: SHARE_RESULT.ERROR,
      detail: err?.message || 'Could not open share sheet.',
    };
  }
}
