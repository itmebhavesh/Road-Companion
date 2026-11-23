// Role-Based Access Control and Administrative Services for Road Companion
import {
  db,
  auth,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  query,
  orderBy,
  serverTimestamp
} from "./firebase.js";

export const ROLES = {
  SUPER_ADMIN: "super_admin",
  CITY_ADMIN: "city_admin",
  MODERATOR: "moderator",
  CITIZEN: "citizen"
};

export const ROLE_LABELS = {
  super_admin: "Super Admin",
  city_admin: "City Admin",
  moderator: "Moderator",
  citizen: "Citizen"
};

const USERS_COLLECTION = "users";
const AUDIT_COLLECTION = "audit_logs";
const REPORTS_COLLECTION = "reports";

// Local cache for user profile during session
let cachedProfile = null;
let cachedUid = null;

/**
 * Fetch or initialize a user profile in Firestore.
 */
export async function getUserProfile(uid) {
  if (!uid) return null;
  if (cachedUid === uid && cachedProfile) return cachedProfile;

  try {
    const userRef = doc(db, USERS_COLLECTION, uid);
    const snap = await getDoc(userRef);

    if (snap.exists()) {
      cachedProfile = { id: snap.id, ...snap.data() };
    } else {
      // Default new profile if not found
      cachedProfile = {
        id: uid,
        email: auth.currentUser?.email || "",
        role: ROLES.CITIZEN,
        assignedCities: [],
        status: "active",
        createdAt: new Date().toISOString()
      };
    }
    cachedUid = uid;
    return cachedProfile;
  } catch (error) {
    console.warn("Could not read user profile:", error);
    return {
      id: uid,
      email: auth.currentUser?.email || "",
      role: ROLES.CITIZEN,
      assignedCities: [],
      status: "active"
    };
  }
}

/**
 * Clear cached profile on logout
 */
export function clearCachedProfile() {
  cachedProfile = null;
  cachedUid = null;
}

/**
 * Check if the user has administrative privileges
 */
export function isAnyAdmin(profile) {
  if (!profile || !profile.role) return false;
  return [ROLES.SUPER_ADMIN, ROLES.CITY_ADMIN, ROLES.MODERATOR].includes(profile.role);
}

/**
 * Check if City Admin has jurisdiction over a given city
 */
export function canManageCity(profile, city) {
  if (!profile) return false;
  if (profile.role === ROLES.SUPER_ADMIN) return true;
  if (profile.role === ROLES.CITY_ADMIN) {
    if (!profile.assignedCities || profile.assignedCities.length === 0) return true;
    return profile.assignedCities.includes(city);
  }
  return false;
}

/**
 * Record an immutable audit log entry in Firestore
 */
export async function recordAuditLog({
  action,
  reportId = null,
  previousStatus = null,
  newStatus = null,
  notes = "",
  targetUserId = null
}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Authentication required for administrative actions.");

  const profile = await getUserProfile(user.uid);

  const entry = {
    action,
    reportId: reportId || null,
    adminId: user.uid,
    adminEmail: user.email || "Unknown",
    adminRole: profile?.role || "unknown",
    targetUserId: targetUserId || null,
    previousStatus: previousStatus || null,
    newStatus: newStatus || null,
    notes: String(notes || "").trim(),
    timestamp: serverTimestamp(),
    recordedAtIso: new Date().toISOString()
  };

  try {
    await addDoc(collection(db, AUDIT_COLLECTION), entry);
    return entry;
  } catch (error) {
    console.error("Failed to write audit log:", error);
    // Don't swallow audit log failures in production
    throw new Error("Audit logging failed: " + (error.message || "Unknown error"));
  }
}

/**
 * Fetch all audit logs sorted by newest first
 */
export async function fetchAuditLogs(limitCount = 100) {
  const auditRef = collection(db, AUDIT_COLLECTION);
  try {
    const q = query(auditRef, orderBy("timestamp", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.warn("Index fallback for audit logs:", error);
    const snap = await getDocs(auditRef);
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const timeA = a.timestamp?.toMillis ? a.timestamp.toMillis() : new Date(a.recordedAtIso || 0).getTime();
        const timeB = b.timestamp?.toMillis ? b.timestamp.toMillis() : new Date(b.recordedAtIso || 0).getTime();
        return timeB - timeA;
      });
  }
}

/**
 * Update report status with mandatory admin UID and timestamp recording
 */
export async function updateReportStatus({
  reportId,
  previousStatus,
  newStatus,
  notes = "",
  city = null
}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Log in as an administrator to change report statuses.");

  const profile = await getUserProfile(user.uid);
  if (!isAnyAdmin(profile)) {
    throw new Error("Unauthorized: Only administrators and moderators can change status.");
  }

  // City Admin city check
  if (profile.role === ROLES.CITY_ADMIN && city && !canManageCity(profile, city)) {
    throw new Error(`Unauthorized: You are not assigned to manage reports in ${city}.`);
  }

  // Moderators can only flag or recommend verification, or change to Verified if authorized
  if (profile.role === ROLES.MODERATOR && newStatus === "Resolved") {
    throw new Error("Moderators cannot directly resolve reports. Only City Admins and Super Admins may mark as Resolved.");
  }

  const reportRef = doc(db, REPORTS_COLLECTION, reportId);

  // Update report document
  await updateDoc(reportRef, {
    status: newStatus,
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
    updatedByEmail: user.email,
    lastAdminNote: notes
  });

  // Write immutable audit log
  await recordAuditLog({
    action: "STATUS_UPDATE",
    reportId,
    previousStatus,
    newStatus,
    notes
  });

  return { success: true, reportId, newStatus };
}

/**
 * Flag a report as duplicate, suspicious, or inappropriate
 */
export async function flagReport({
  reportId,
  flagType, // "duplicate" | "suspicious" | "inappropriate"
  value = true,
  notes = ""
}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Log in to moderate reports.");

  const profile = await getUserProfile(user.uid);
  if (!isAnyAdmin(profile)) {
    throw new Error("Unauthorized: Moderator or Admin privileges required.");
  }

  const reportRef = doc(db, REPORTS_COLLECTION, reportId);
  const updatePayload = {
    [`flags.${flagType}`]: value,
    moderationNotes: notes,
    moderatedBy: user.uid,
    moderatedAt: serverTimestamp()
  };

  await updateDoc(reportRef, updatePayload);

  await recordAuditLog({
    action: `FLAG_${flagType.toUpperCase()}`,
    reportId,
    notes: `Flag ${flagType} set to ${value}. Note: ${notes}`
  });

  return { success: true };
}

/**
 * User management: Super Admin updates user role and city permissions
 */
export async function updateUserRole({
  targetUserId,
  role,
  assignedCities = [],
  status = "active"
}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Authentication required.");

  const profile = await getUserProfile(user.uid);
  if (profile.role !== ROLES.SUPER_ADMIN) {
    throw new Error("Unauthorized: Only Super Admins can manage user roles and permissions.");
  }

  const targetRef = doc(db, USERS_COLLECTION, targetUserId);
  await setDoc(
    targetRef,
    {
      role,
      assignedCities: Array.isArray(assignedCities) ? assignedCities : [],
      status,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid
    },
    { merge: true }
  );

  await recordAuditLog({
    action: "ROLE_CHANGE",
    targetUserId,
    notes: `Role changed to ${role}. Assigned cities: ${assignedCities.join(", ") || "None"}. Status: ${status}`
  });

  return { success: true };
}

/**
 * List all registered user profiles (Super Admin only)
 */
export async function listAllUsers() {
  const user = auth.currentUser;
  if (!user) throw new Error("Authentication required.");

  const profile = await getUserProfile(user.uid);
  if (profile.role !== ROLES.SUPER_ADMIN) {
    throw new Error("Unauthorized: Only Super Admins can view user management.");
  }

  const usersSnap = await getDocs(collection(db, USERS_COLLECTION));
  return usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
