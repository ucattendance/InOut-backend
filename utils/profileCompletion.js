const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

const REQUIRED_PROFILE_CHECKS = [
  { key: 'address', get: (u) => u.address },
  { key: 'bloodGroup', get: (u) => u.bloodGroup },
  { key: 'dateOfBirth', get: (u) => u.dateOfBirth },
  { key: 'bankDetails.bankingName', get: (u) => u.bankDetails?.bankingName },
  { key: 'bankDetails.bankAccountNumber', get: (u) => u.bankDetails?.bankAccountNumber },
  { key: 'bankDetails.ifscCode', get: (u) => u.bankDetails?.ifscCode },
  { key: 'skills', get: (u) => u.skills },
];

const isFilled = (value) => {
  if (value == null) return false;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) {
    return value.some((item) => {
      if (item == null) return false;
      if (typeof item === 'string') return item.trim().length > 0;
      return true;
    });
  }
  return true;
};

const getProfileIncompleteGraceMs = () => {
  const raw = process.env.PROFILE_INCOMPLETE_GRACE_MS;
  if (raw != null && raw !== '' && Number.isFinite(Number(raw))) {
    return Number(raw);
  }
  return THREE_DAYS_MS;
};

const getMissingProfileFields = (user) =>
  REQUIRED_PROFILE_CHECKS.filter(({ get }) => !isFilled(get(user))).map(({ key }) => key);

const isProfileComplete = (user) => getMissingProfileFields(user).length === 0;

const hasIncompleteGraceExpired = (profileIncompleteSince, now = new Date()) => {
  if (!profileIncompleteSince) return false;
  const started = new Date(profileIncompleteSince).getTime();
  if (Number.isNaN(started)) return false;
  return now.getTime() - started >= getProfileIncompleteGraceMs();
};

/**
 * Persist incomplete-profile tracking / auto-lock for check-in.
 * Mutates and saves the user document when state changes.
 *
 * @returns {{
 *   locked: boolean,
 *   profileIncomplete: boolean,
 *   missingFields: string[],
 *   justLocked: boolean,
 * }}
 */
const applyProfileGateOnCheckIn = async (user, now = new Date()) => {
  const missingFields = getMissingProfileFields(user);
  const profileIncomplete = missingFields.length > 0;

  if (!profileIncomplete) {
    if (user.profileIncompleteSince) {
      user.profileIncompleteSince = null;
      await user.save();
    }
    return {
      locked: Boolean(user.attendanceLocked),
      profileIncomplete: false,
      missingFields: [],
      justLocked: false,
    };
  }

  if (user.attendanceLocked) {
    return {
      locked: true,
      profileIncomplete: true,
      missingFields,
      justLocked: false,
    };
  }

  if (!user.profileIncompleteSince) {
    user.profileIncompleteSince = now;
    await user.save();
    return {
      locked: false,
      profileIncomplete: true,
      missingFields,
      justLocked: false,
    };
  }

  if (hasIncompleteGraceExpired(user.profileIncompleteSince, now)) {
    user.attendanceLocked = true;
    user.attendanceLockedAt = now;
    await user.save();
    return {
      locked: true,
      profileIncomplete: true,
      missingFields,
      justLocked: true,
    };
  }

  return {
    locked: false,
    profileIncomplete: true,
    missingFields,
    justLocked: false,
  };
};

/** Clear grace tracking when profile becomes complete (does not unlock a locked user). */
const clearIncompleteTrackingIfComplete = async (user) => {
  if (!user || user.attendanceLocked) return user;
  if (!isProfileComplete(user)) return user;
  if (!user.profileIncompleteSince) return user;
  user.profileIncompleteSince = null;
  await user.save();
  return user;
};

module.exports = {
  THREE_DAYS_MS,
  REQUIRED_PROFILE_CHECKS,
  getMissingProfileFields,
  isProfileComplete,
  hasIncompleteGraceExpired,
  getProfileIncompleteGraceMs,
  applyProfileGateOnCheckIn,
  clearIncompleteTrackingIfComplete,
};
