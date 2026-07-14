/* ============================================================
   PageMind — Auth Logic (login.js)
   ============================================================ */

'use strict';

// ── Panel references ──────────────────────────────────────────
const loginPanel    = document.getElementById('loginPanel');
const registerPanel = document.getElementById('registerPanel');
const successPanel  = document.getElementById('successPanel');

// ── Switch helpers ────────────────────────────────────────────
function switchPanel(from, to) {
  from.classList.add('auth-panel--leaving');

  from.addEventListener('animationend', () => {
    from.classList.remove('auth-panel--leaving');
    from.classList.add('auth-panel--hidden');

    to.classList.remove('auth-panel--hidden');
    to.classList.add('auth-panel--entering');

    to.addEventListener('animationend', () => {
      to.classList.remove('auth-panel--entering');
    }, { once: true });

    // Focus first visible input in the panel we're showing
    const firstInput = to.querySelector('input:not([type="checkbox"])');
    if (firstInput) firstInput.focus();
  }, { once: true });
}

document.getElementById('goToRegister').addEventListener('click', () => {
  clearForm(loginPanel);
  switchPanel(loginPanel, registerPanel);
});

document.getElementById('goToLogin').addEventListener('click', () => {
  clearForm(registerPanel);
  switchPanel(registerPanel, loginPanel);
});

document.getElementById('backToLogin').addEventListener('click', () => {
  switchPanel(successPanel, loginPanel);
});

document.getElementById('goToDashboard').addEventListener('click', () => {
  window.location.href = '/dashboard.html';
});

// ── Password visibility toggles ───────────────────────────────
document.querySelectorAll('.toggle-pw').forEach(btn => {
  btn.addEventListener('click', () => {
    const input   = document.getElementById(btn.dataset.target);
    const isHide  = input.type === 'password';
    input.type    = isHide ? 'text' : 'password';

    btn.querySelector('.eye-show').style.display = isHide ? 'none'  : '';
    btn.querySelector('.eye-hide').style.display = isHide ? ''      : 'none';
  });
});

// ── Validation helpers ────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function setError(inputEl, errorId, message) {
  inputEl.classList.add('is-error');
  inputEl.classList.remove('is-valid');
  document.getElementById(errorId).textContent = message;
  return false;
}

function clearError(inputEl, errorId) {
  inputEl.classList.remove('is-error');
  inputEl.classList.add('is-valid');
  document.getElementById(errorId).textContent = '';
  return true;
}

function clearField(inputEl, errorId) {
  inputEl.classList.remove('is-error', 'is-valid');
  document.getElementById(errorId).textContent = '';
}

function clearForm(panel) {
  panel.querySelectorAll('.field-input').forEach(inp => {
    inp.value = '';
    inp.classList.remove('is-error', 'is-valid');
  });
  panel.querySelectorAll('.field-error').forEach(el => el.textContent = '');
  const strength = document.getElementById('strengthBar');
  if (strength) { resetStrength(); }
}

function validateEmail(value, inputEl, errorId) {
  if (!value) return setError(inputEl, errorId, 'Email address is required.');
  if (!EMAIL_RE.test(value)) return setError(inputEl, errorId, 'Please enter a valid email address.');
  return clearError(inputEl, errorId);
}

function validatePassword(value, inputEl, errorId) {
  if (!value) return setError(inputEl, errorId, 'Password is required.');
  if (value.length < 8) return setError(inputEl, errorId, 'Password must be at least 8 characters.');
  return clearError(inputEl, errorId);
}

function validateRequired(value, inputEl, errorId, label) {
  if (!value.trim()) return setError(inputEl, errorId, `${label} is required.`);
  return clearError(inputEl, errorId);
}

// ── Real-time inline validation ───────────────────────────────
// Login panel
document.getElementById('loginEmail').addEventListener('blur', e => {
  validateEmail(e.target.value.trim(), e.target, 'loginEmailErr');
});
document.getElementById('loginPassword').addEventListener('blur', e => {
  validatePassword(e.target.value, e.target, 'loginPasswordErr');
});

// Register panel — live feedback as user types
['regFirstName', 'regLastName', 'regEmail', 'regPassword', 'regConfirm'].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener('input', () => liveValidateReg(id));
  el.addEventListener('blur',  () => liveValidateReg(id));
});

function liveValidateReg(id) {
  const el = document.getElementById(id);
  switch (id) {
    case 'regFirstName': validateRequired(el.value, el, 'regFirstNameErr', 'First name'); break;
    case 'regLastName':  validateRequired(el.value, el, 'regLastNameErr',  'Last name');  break;
    case 'regEmail':     validateEmail(el.value.trim(), el, 'regEmailErr');                break;
    case 'regPassword':
      validatePassword(el.value, el, 'regPasswordErr');
      updateStrength(el.value);
      // Re-check confirm if already filled
      const confirm = document.getElementById('regConfirm');
      if (confirm.value) liveValidateReg('regConfirm');
      break;
    case 'regConfirm': {
      const pw = document.getElementById('regPassword').value;
      if (!el.value) { setError(el, 'regConfirmErr', 'Please confirm your password.'); break; }
      if (el.value !== pw) { setError(el, 'regConfirmErr', 'Passwords do not match.'); break; }
      clearError(el, 'regConfirmErr');
      break;
    }
  }
}

// ── Password strength meter ───────────────────────────────────
const strengthFill  = document.getElementById('strengthFill');
const strengthLabel = document.getElementById('strengthLabel');

const STRENGTH_CONFIG = [
  { label: '',       color: '',                      width: '0%'  },
  { label: 'Weak',   color: 'var(--error)',           width: '25%' },
  { label: 'Fair',   color: 'var(--warn)',            width: '50%' },
  { label: 'Good',   color: '#b8c62b',               width: '75%' },
  { label: 'Strong', color: 'var(--success)',         width: '100%'},
];

function scorePassword(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(4, Math.max(1, Math.ceil(score / 1.25)));
}

function updateStrength(pw) {
  const level = pw ? scorePassword(pw) : 0;
  const cfg   = STRENGTH_CONFIG[level];
  strengthFill.style.width      = cfg.width;
  strengthFill.style.background = cfg.color;
  strengthLabel.textContent     = cfg.label;
  strengthLabel.style.color     = cfg.color;
}

function resetStrength() {
  strengthFill.style.width  = '0%';
  strengthLabel.textContent = '';
}

// ── Login form submit ─────────────────────────────────────────
document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();

  const emailEl = document.getElementById('loginEmail');
  const pwEl    = document.getElementById('loginPassword');

  const emailOk = validateEmail(emailEl.value.trim(), emailEl, 'loginEmailErr');
  const pwOk    = validatePassword(pwEl.value, pwEl, 'loginPasswordErr');

  if (!emailOk || !pwOk) return;

  const btn = document.getElementById('loginBtn');
  btn.classList.add('loading');
  btn.disabled = true;

  try {
    // Simulate an API call — replace with real fetch to your backend
    await fakeApiCall({ email: emailEl.value.trim(), password: pwEl.value });

    localStorage.setItem('pm_user_email', emailEl.value.trim());
    window.location.href = '/dashboard.html';
  } catch (err) {
    setError(emailEl, 'loginEmailErr', err.message || 'Invalid credentials. Please try again.');
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
});

// ── Register form submit ──────────────────────────────────────
document.getElementById('registerForm').addEventListener('submit', async e => {
  e.preventDefault();

  const firstName = document.getElementById('regFirstName');
  const lastName  = document.getElementById('regLastName');
  const email     = document.getElementById('regEmail');
  const password  = document.getElementById('regPassword');
  const confirm   = document.getElementById('regConfirm');
  const terms     = document.getElementById('agreeTerms');

  const checks = [
    validateRequired(firstName.value, firstName, 'regFirstNameErr', 'First name'),
    validateRequired(lastName.value,  lastName,  'regLastNameErr',  'Last name'),
    validateEmail(email.value.trim(), email, 'regEmailErr'),
    validatePassword(password.value,  password, 'regPasswordErr'),
  ];

  // Confirm password
  let confirmOk = true;
  if (!confirm.value) {
    confirmOk = setError(confirm, 'regConfirmErr', 'Please confirm your password.');
  } else if (confirm.value !== password.value) {
    confirmOk = setError(confirm, 'regConfirmErr', 'Passwords do not match.');
  } else {
    clearError(confirm, 'regConfirmErr');
  }
  checks.push(confirmOk);

  // Terms checkbox
  let termsOk = true;
  if (!terms.checked) {
    termsOk = false;
    document.getElementById('agreeTermsErr').textContent = 'You must accept the Terms of Service to continue.';
  } else {
    document.getElementById('agreeTermsErr').textContent = '';
  }
  checks.push(termsOk);

  if (checks.includes(false)) return;

  const btn = document.getElementById('registerBtn');
  btn.classList.add('loading');
  btn.disabled = true;

  try {
    // Simulate API call — replace with real registration endpoint
    await fakeApiCall({
      firstName: firstName.value.trim(),
      lastName:  lastName.value.trim(),
      email:     email.value.trim(),
      password:  password.value,
    });

    // Show success panel
    switchPanel(registerPanel, successPanel);
  } catch (err) {
    setError(email, 'regEmailErr', err.message || 'Registration failed. Please try again.');
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
});

// ── Terms checkbox — clear error on check ────────────────────
document.getElementById('agreeTerms').addEventListener('change', function () {
  if (this.checked) document.getElementById('agreeTermsErr').textContent = '';
});

// ── Social login handlers ─────────────────────────────────────
const GOOGLE_CLIENT_ID    = '1002837047506-dghofntmpn68s1vhp1j4epvg8pfupqg8.apps.googleusercontent.com';
const GOOGLE_REDIRECT_URI = 'http://localhost:8080/dashboard.html';

document.getElementById('googleLoginBtn').addEventListener('click', () => {
  console.log('Redirecting to Google...');
  window.location.href = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=1002837047506-dghofntmpn68s1vhp1j4epvg8pfupqg8.apps.googleusercontent.com&redirect_uri=http%3A%2F%2Flocalhost%3A8080%2Fdashboard.html&response_type=code&scope=email%20profile';
});

document.getElementById('btnApple').addEventListener('click', () => {
  // Production: window.location.href = '/api/auth/apple';
  alert('Apple sign-in flow — replace with your Sign in with Apple redirect.');
});

// ── Mock API (replace with real fetch calls) ──────────────────
function fakeApiCall(payload) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      // Simulate a known-bad email to demo error state
      if (payload.email === 'error@example.com') {
        reject(new Error('An account with this email already exists.'));
      } else {
        resolve({ success: true });
      }
    }, 1200);
  });
}
