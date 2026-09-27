/**
 * Client-side validation for the Safe-Her authentication forms.
 *
 * Rules here mirror what Supabase enforces on its side. They exist to give the
 * user an instant, friendly message instead of a round-trip error — Supabase
 * remains the authority.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Common breached/placeholder passwords we refuse outright. */
const BANNED_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789',
  'qwerty123', 'letmein1', 'welcome1', 'admin123', 'iloveyou',
  'safeher123', 'safeher1234',
]);

export function validateEmail(raw) {
  const value = String(raw || '').trim();
  if (!value) return 'Enter your email address.';
  if (!EMAIL_RE.test(value)) return 'Enter a valid email address, for example name@domain.com.';
  return null;
}

/**
 * @returns {{ ok: boolean, score: 0|1|2|3|4, error: string|null, hint: string }}
 */
export function validatePassword(raw) {
  const value = String(raw || '');

  if (!value) return { ok: false, score: 0, error: 'Choose a password.', hint: '' };
  if (value.length < 8) {
    return { ok: false, score: 0, error: 'Use at least 8 characters.', hint: 'Passwords must be at least 8 characters long.' };
  }
  if (BANNED_PASSWORDS.has(value.toLowerCase())) {
    return { ok: false, score: 0, error: 'That password is too common. Choose something unique.', hint: '' };
  }

  const hasLower = /[a-z]/.test(value);
  const hasUpper = /[A-Z]/.test(value);
  const hasNumber = /[0-9]/.test(value);
  const hasSymbol = /[^A-Za-z0-9]/.test(value);
  const variety = [hasLower, hasUpper, hasNumber, hasSymbol].filter(Boolean).length;

  let score = 1;
  if (variety >= 2) score = 2;
  if (variety >= 3 && value.length >= 10) score = 3;
  if (variety >= 3 && value.length >= 12) score = 4;

  // Minimum bar: 8 chars + not on the banned list. Variety only affects the meter.
  return { ok: true, score, error: null, hint: passwordHint(score) };
}

export function passwordHint(score) {
  switch (score) {
    case 1:
      return 'Weak — add capitals, numbers or symbols.';
    case 2:
      return 'Fair — a little longer and more varied would help.';
    case 3:
      return 'Good password.';
    case 4:
      return 'Strong password.';
    default:
      return 'Use at least 8 characters.';
  }
}

export function validateConfirm(raw, password) {
  if (!raw) return 'Re-enter your password.';
  if (raw !== password) return 'Passwords do not match.';
  return null;
}

export function validateName(raw) {
  const value = String(raw || '').trim();
  if (!value) return 'Enter your full name.';
  if (value.length < 2) return 'Your name looks too short.';
  if (value.length > 80) return 'Please use a shorter name.';
  return null;
}

export function validatePhone(raw) {
  const value = String(raw || '').trim();
  if (!value) return null; // optional
  const digits = value.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return 'Enter a valid phone number.';
  return null;
}

/**
 * Full signup validation.
 * @returns {{ valid: boolean, errors: object }}
 */
export function validateSignup({ fullName, email, password, confirmPassword, phone }) {
  const errors = {};

  const nameError = validateName(fullName);
  if (nameError) errors.fullName = nameError;

  const emailError = validateEmail(email);
  if (emailError) errors.email = emailError;

  const passwordResult = validatePassword(password);
  if (passwordResult.error) errors.password = passwordResult.error;

  const confirmError = validateConfirm(confirmPassword, password);
  if (confirmError) errors.confirmPassword = confirmError;

  const phoneError = validatePhone(phone);
  if (phoneError) errors.phone = phoneError;

  return { valid: Object.keys(errors).length === 0, errors };
}

/** Full login validation. */
export function validateLogin({ email, password }) {
  const errors = {};
  const emailError = validateEmail(email);
  if (emailError) errors.email = emailError;
  if (!password) errors.password = 'Enter your password.';
  return { valid: Object.keys(errors).length === 0, errors };
}
