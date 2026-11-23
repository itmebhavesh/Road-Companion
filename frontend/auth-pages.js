// Shared logic for login.html and signup.html.
// Reuses the existing auth.js wrappers (and through them the single Firebase
// initialization in firebase.js). The page is chosen by <body data-page="...">.
import { checkAuth, login, signup, resetPassword } from "./auth.js";

// After login or signup, return to the page the visitor came from (local pages only).
const ALLOWED_NEXT = ["index.html", "report.html", "reports.html", "navigate.html", "admin.html"];
const requestedNext = new URLSearchParams(window.location.search).get("next");
const DASHBOARD_URL = ALLOWED_NEXT.includes(requestedNext) ? requestedNext : "index.html";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const page = document.body.dataset.page === "signup" ? "signup" : "login";
const form = byId("authForm");
const emailInput = byId("email");
const passwordInput = byId("password");
const confirmInput = page === "signup" ? byId("confirmPassword") : null;
const submitBtn = byId("submitBtn");
const pwToggle = byId("pwToggle");
const message = byId("authMessage");

let busy = false;

// Keep the destination when switching between the login and signup pages.
const switchLink = document.querySelector(".auth-switch a[href$='.html']");
if (switchLink && DASHBOARD_URL !== "index.html") {
  switchLink.href = `${switchLink.getAttribute("href")}?next=${encodeURIComponent(DASHBOARD_URL)}`;
}

// Already signed in? Skip the auth pages. The listener fires once Firebase has
// restored the saved session, and again after a successful login or signup.
checkAuth((user) => {
  if (user) window.location.replace(DASHBOARD_URL);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;

  const credentials = readCredentials();
  if (credentials.error) {
    setMessage(credentials.error, "error");
    credentials.focus?.focus();
    return;
  }

  setBusy(true);
  setMessage("", "");

  try {
    if (page === "signup") {
      await signup(credentials.email, credentials.password);
      setMessage("Account created. Redirecting…", "success");
    } else {
      await login(credentials.email, credentials.password);
      setMessage("Logged in. Redirecting…", "success");
    }
    passwordInput.value = "";
    if (confirmInput) confirmInput.value = "";
    // Stay disabled while the browser navigates away.
    window.location.replace(DASHBOARD_URL);
  } catch (error) {
    console.error(error);
    setMessage(authErrorMessage(error), "error");
    setBusy(false);
  }
});

pwToggle.addEventListener("click", () => {
  const show = passwordInput.type === "password";
  passwordInput.type = show ? "text" : "password";
  if (confirmInput) confirmInput.type = show ? "text" : "password";
  pwToggle.textContent = show ? "Hide" : "Show";
  pwToggle.setAttribute("aria-pressed", String(show));
  pwToggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
});

function readCredentials() {
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Enter a valid email address.", focus: emailInput };
  }
  if (password.length < 6) {
    return { error: "Use a password with at least 6 characters.", focus: passwordInput };
  }
  if (confirmInput && confirmInput.value !== password) {
    return { error: "The two passwords do not match.", focus: confirmInput };
  }

  return { email, password };
}

function setBusy(value) {
  busy = value;
  submitBtn.disabled = value;
  if (value) {
    if (!submitBtn.dataset.label) submitBtn.dataset.label = submitBtn.textContent;
    submitBtn.textContent = page === "signup" ? "Creating account…" : "Logging in…";
  } else if (submitBtn.dataset.label) {
    submitBtn.textContent = submitBtn.dataset.label;
    delete submitBtn.dataset.label;
  }
}

function setMessage(text, type) {
  message.textContent = text;
  message.classList.toggle("success", type === "success" && Boolean(text));
  message.classList.toggle("error", type === "error" && Boolean(text));
}

function authErrorMessage(error) {
  const code = error?.code || "";
  const messages = {
    "auth/invalid-email": "Enter a valid email address.",
    "auth/missing-password": "Enter your password.",
    "auth/weak-password": "Use a password with at least 6 characters.",
    "auth/email-already-in-use": "An account with that email already exists. Log in instead.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/user-not-found": "No account was found for that email.",
    "auth/wrong-password": "Email or password is incorrect.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/too-many-requests": "Too many attempts. Wait a moment and try again.",
    "auth/network-request-failed": "Network error. Check your connection and try again.",
    "auth/operation-not-allowed": "Email and password sign-in is not enabled in Firebase Authentication."
  };

  return messages[code] || "Authentication failed. Please try again.";
}

function byId(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element;
}

// Forgot Password Modal Integration (login page only)
const forgotPwBtn = document.getElementById("forgotPwBtn");
const forgotModal = document.getElementById("forgotModal");
const forgotForm = document.getElementById("forgotForm");
const resetEmailInput = document.getElementById("resetEmail");
const cancelResetBtn = document.getElementById("cancelResetBtn");
const sendResetBtn = document.getElementById("sendResetBtn");
const resetMessage = document.getElementById("resetMessage");

if (forgotPwBtn && forgotModal) {
  forgotPwBtn.addEventListener("click", () => {
    resetMessage.textContent = "";
    resetMessage.className = "message";
    resetEmailInput.value = emailInput.value.trim();
    forgotModal.hidden = false;
    resetEmailInput.focus();
  });

  cancelResetBtn?.addEventListener("click", () => {
    forgotModal.hidden = true;
  });

  forgotModal.addEventListener("click", (e) => {
    if (e.target === forgotModal) forgotModal.hidden = true;
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !forgotModal.hidden) {
      forgotModal.hidden = true;
    }
  });

  forgotForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = resetEmailInput.value.trim();
    if (!EMAIL_PATTERN.test(email)) {
      setResetMessage("Enter a valid registered email address.", "error");
      resetEmailInput.focus();
      return;
    }

    sendResetBtn.disabled = true;
    sendResetBtn.textContent = "Sending…";
    setResetMessage("Sending password reset email…", "");

    try {
      await resetPassword(email);
      setResetMessage("Password reset email sent! Check your inbox (and spam folder) for instructions.", "success");
      sendResetBtn.textContent = "Sent";
      setTimeout(() => {
        forgotModal.hidden = true;
        sendResetBtn.disabled = false;
        sendResetBtn.textContent = "Send reset link";
      }, 4000);
    } catch (error) {
      console.error("Password reset error:", error);
      setResetMessage(authErrorMessage(error), "error");
      sendResetBtn.disabled = false;
      sendResetBtn.textContent = "Send reset link";
    }
  });
}

function setResetMessage(text, type) {
  if (!resetMessage) return;
  resetMessage.textContent = text;
  resetMessage.classList.toggle("success", type === "success" && Boolean(text));
  resetMessage.classList.toggle("error", type === "error" && Boolean(text));
}
