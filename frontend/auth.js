import {
  auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged
} from "./firebase.js";

// Signup
export async function signup(email, password) {
  return await createUserWithEmailAndPassword(auth, email, password);
}

// Login
export async function login(email, password) {
  return await signInWithEmailAndPassword(auth, email, password);
}

// Reset password
export async function resetPassword(email) {
  return await sendPasswordResetEmail(auth, email);
}

// Logout
export async function logout() {
  return await signOut(auth);
}

// Check logged-in user
export function checkAuth(callback) {
  return onAuthStateChanged(auth, callback);
}