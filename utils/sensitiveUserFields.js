const MASK = '****';

const SENSITIVE_USER_KEYS = new Set(['pan', 'uan', 'esiNumber', 'empGrade']);

const SENSITIVE_BANK_KEYS = new Set([
  'bankAccountNumber',
  'accountNumber',
  'ifscCode',
  'ifsc',
  'upiId',
  'bankingName',
  'bankName',
  'accountHolderName',
]);

const canViewSensitiveFields = (viewer, targetUserId) => {
  if (!viewer) return false;
  if (viewer.role === 'admin') return true;
  if (targetUserId == null) return false;
  return String(viewer._id) === String(targetUserId);
};

const maskBankDetails = (bankDetails) => {
  if (!bankDetails || typeof bankDetails !== 'object') return bankDetails;

  const masked = { ...bankDetails };
  for (const key of Object.keys(masked)) {
    if (key === 'officeBranch') continue;
    if (!SENSITIVE_BANK_KEYS.has(key)) continue;
    if (masked[key] != null && masked[key] !== '') {
      masked[key] = MASK;
    }
  }
  return masked;
};

const maskSensitiveUserFields = (user, viewer) => {
  const obj = typeof user?.toObject === 'function' ? user.toObject() : { ...user };
  const targetUserId = obj._id ?? obj.id;

  if (canViewSensitiveFields(viewer, targetUserId)) {
    return obj;
  }

  if ('salary' in obj) {
    delete obj.salary;
  }

  for (const key of SENSITIVE_USER_KEYS) {
    if (key in obj) {
      delete obj[key];
    }
  }

  if (obj.bankDetails) {
    obj.bankDetails = maskBankDetails(obj.bankDetails);
  }

  return obj;
};

const maskSensitiveUserList = (users, viewer) =>
  (users || []).map((user) => maskSensitiveUserFields(user, viewer));

module.exports = {
  MASK,
  canViewSensitiveFields,
  maskBankDetails,
  maskSensitiveUserFields,
  maskSensitiveUserList,
};
