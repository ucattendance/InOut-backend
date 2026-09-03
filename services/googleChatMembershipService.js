const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');
const { getNewUserWebhookUrl } = require('./birthdayWishService');

const CHAT_MEMBERSHIP_SCOPE = 'https://www.googleapis.com/auth/chat.memberships';

const extractSpaceIdFromWebhookUrl = (url) => {
  const match = String(url || '').match(/\/spaces\/([^/?]+)/);
  return match ? match[1] : '';
};

const membershipEnabled = () => process.env.GOOGLE_CHAT_JOIN_CHECK_ENABLED !== 'false';

/** Team invites manually in Chat; InOut only watches for JOINED. */
const autoInviteEnabled = () => process.env.GOOGLE_CHAT_AUTO_INVITE_ENABLED === 'true';

const getWelcomeSpaceId = () => {
  const configured = String(process.env.GOOGLE_CHAT_WELCOME_SPACE_ID || '').trim();
  if (configured) return configured.replace(/^spaces\//, '');
  return extractSpaceIdFromWebhookUrl(getNewUserWebhookUrl());
};

const loadServiceAccountCredentials = () => {
  const inlineJson = String(process.env.GOOGLE_CHAT_SERVICE_ACCOUNT_JSON || '').trim();
  if (inlineJson) {
    return JSON.parse(inlineJson);
  }

  const filePath = String(process.env.GOOGLE_CHAT_SERVICE_ACCOUNT_PATH || '').trim();
  if (!filePath) return null;

  const resolved = path.isAbsolute(filePath)
    ? filePath
    : path.join(__dirname, '..', filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`GOOGLE_CHAT_SERVICE_ACCOUNT_PATH not found: ${resolved}`);
  }
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
};

const hasMembershipCredentials = () => {
  try {
    const credentials = loadServiceAccountCredentials();
    const adminEmail = String(process.env.GOOGLE_CHAT_ADMIN_EMAIL || '').trim();
    return Boolean(credentials && adminEmail);
  } catch (_) {
    return false;
  }
};

const getAccessToken = async () => {
  const credentials = loadServiceAccountCredentials();
  const adminEmail = String(process.env.GOOGLE_CHAT_ADMIN_EMAIL || '').trim();
  if (!credentials || !adminEmail) {
    throw new Error('Google Chat membership credentials are not configured');
  }

  const auth = new GoogleAuth({
    credentials,
    scopes: [CHAT_MEMBERSHIP_SCOPE],
    clientOptions: { subject: adminEmail },
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = typeof tokenResponse === 'string' ? tokenResponse : tokenResponse?.token;
  if (!token) {
    throw new Error('Failed to obtain Google Chat access token');
  }
  return token;
};

const isAlreadyMemberError = (status, message) =>
  status === 409 || /already exists|already a member|already in/i.test(String(message || ''));

const normalizeMembershipState = (state) => {
  const value = String(state || '').trim().toUpperCase();
  if (value === 'JOINED') return 'JOINED';
  if (value === 'INVITED') return 'INVITED';
  if (value === 'NOT_A_MEMBER') return 'NOT_A_MEMBER';
  return value || 'UNKNOWN';
};

const isMembershipJoined = (state) => normalizeMembershipState(state) === 'JOINED';

const membershipMatchesEmail = (membership, email) => {
  const memberName = String(membership?.member?.name || membership?.name || '')
    .trim()
    .toLowerCase();
  const target = `users/${String(email || '').trim().toLowerCase()}`;
  if (!memberName || !email) return false;
  // Resource names: users/{email}, spaces/{space}/members/users/{email}
  return memberName === target || memberName.endsWith(`/${target}`);
};

/**
 * List HUMAN members (only valid Chat list filters: role / member.type).
 * Match the target email in app code — member.name filters are rejected by the API.
 */
const listHumanMemberships = async (spaceId, token) => {
  const listUrl = `https://chat.googleapis.com/v1/spaces/${spaceId}/members`;
  const memberships = [];
  let pageToken = '';

  do {
    const params = {
      filter: 'member.type = "HUMAN"',
      pageSize: 100,
    };
    if (pageToken) params.pageToken = pageToken;

    const response = await axios.get(listUrl, {
      headers: { Authorization: `Bearer ${token}` },
      params,
      timeout: 20000,
    });

    memberships.push(...(response.data?.memberships || []));
    pageToken = response.data?.nextPageToken || '';
  } while (pageToken);

  return memberships;
};

const getMemberMembership = async (spaceId, email) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedSpaceId = String(spaceId || '').trim().replace(/^spaces\//, '');
  if (!normalizedEmail || !normalizedSpaceId) {
    return { status: 'failed', email: normalizedEmail, error: 'Missing email or space id' };
  }

  const token = await getAccessToken();
  // spaces.members.get — {member} = users/{email|userId}
  const directUrl = `https://chat.googleapis.com/v1/spaces/${normalizedSpaceId}/members/users/${encodeURIComponent(normalizedEmail)}`;

  try {
    const response = await axios.get(directUrl, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000,
    });
    const state = normalizeMembershipState(response.data?.state);
    return {
      status: 'found',
      email: normalizedEmail,
      spaceId: normalizedSpaceId,
      state,
      joined: isMembershipJoined(state),
      membership: response.data,
    };
  } catch (directErr) {
    const directStatus = directErr.response?.status;
    // 404 = not a member; still try list as a second check
    try {
      const memberships = await listHumanMemberships(normalizedSpaceId, token);
      const membership = memberships.find((row) =>
        membershipMatchesEmail(row, normalizedEmail)
      );

      if (!membership) {
        if (directStatus === 404) {
          return {
            status: 'not_found',
            email: normalizedEmail,
            spaceId: normalizedSpaceId,
            state: 'NOT_A_MEMBER',
            joined: false,
          };
        }
        return {
          status: 'not_found',
          email: normalizedEmail,
          spaceId: normalizedSpaceId,
          state: 'NOT_A_MEMBER',
          joined: false,
        };
      }

      const state = normalizeMembershipState(membership.state);
      return {
        status: 'found',
        email: normalizedEmail,
        spaceId: normalizedSpaceId,
        state,
        joined: isMembershipJoined(state),
        membership,
      };
    } catch (listErr) {
      const message =
        listErr.response?.data?.error?.message ||
        directErr.response?.data?.error?.message ||
        listErr.message;
      return {
        status: 'failed',
        email: normalizedEmail,
        spaceId: normalizedSpaceId,
        error: message,
      };
    }
  }
};

const addMemberToSpace = async (spaceId, email) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    return { status: 'failed', email, error: 'User email missing' };
  }

  const normalizedSpaceId = String(spaceId || '').trim().replace(/^spaces\//, '');
  if (!normalizedSpaceId) {
    return { status: 'failed', email: normalizedEmail, error: 'Google Chat space ID missing' };
  }

  const token = await getAccessToken();
  const url = `https://chat.googleapis.com/v1/spaces/${normalizedSpaceId}/members`;

  try {
    const response = await axios.post(
      url,
      {
        member: {
          name: `users/${normalizedEmail}`,
          type: 'HUMAN',
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    return {
      status: 'added',
      email: normalizedEmail,
      spaceId: normalizedSpaceId,
      state: normalizeMembershipState(response.data?.state),
      joined: isMembershipJoined(response.data?.state),
      member: response.data,
    };
  } catch (err) {
    const status = err.response?.status;
    const message =
      err.response?.data?.error?.message || err.response?.data?.message || err.message;

    if (isAlreadyMemberError(status, message)) {
      const membership = await getMemberMembership(normalizedSpaceId, normalizedEmail);
      return {
        status: 'already_member',
        email: normalizedEmail,
        spaceId: normalizedSpaceId,
        state: membership.state || 'UNKNOWN',
        joined: Boolean(membership.joined),
        membership: membership.membership,
      };
    }

    return {
      status: 'failed',
      email: normalizedEmail,
      spaceId: normalizedSpaceId,
      error: message,
    };
  }
};

/**
 * Add an approved employee to the UC_JZ_Team (welcome) Chat space.
 * Space ID comes from GOOGLE_CHAT_WELCOME_SPACE_ID or NEW_USER_CHAT_WEBHOOK_URL.
 */
const addApprovedUserToWelcomeSpace = async (user) => {
  if (!autoInviteEnabled()) {
    return { status: 'skipped_manual_invite' };
  }

  if (!membershipEnabled()) {
    return { status: 'skipped_disabled' };
  }

  if (!hasMembershipCredentials()) {
    return { status: 'skipped_no_credentials' };
  }

  const spaceId = getWelcomeSpaceId();
  const spaceName = String(process.env.GOOGLE_CHAT_WELCOME_SPACE_NAME || 'UC_JZ_Team').trim();
  const result = await addMemberToSpace(spaceId, user?.email);

  if (result.status === 'added') {
    console.log(
      `[GoogleChat] Added ${result.email} to ${spaceName} (${result.spaceId})`
    );
  } else if (result.status === 'already_member') {
    console.log(
      `[GoogleChat] ${result.email} already in ${spaceName} (${result.spaceId})`
    );
  } else if (result.status === 'failed') {
    console.error(
      `[GoogleChat] Failed to add ${result.email} to ${spaceName}: ${result.error}`
    );
  }

  return { ...result, spaceName };
};

module.exports = {
  CHAT_MEMBERSHIP_SCOPE,
  extractSpaceIdFromWebhookUrl,
  membershipEnabled,
  autoInviteEnabled,
  getWelcomeSpaceId,
  hasMembershipCredentials,
  normalizeMembershipState,
  isMembershipJoined,
  membershipMatchesEmail,
  listHumanMemberships,
  getMemberMembership,
  addMemberToSpace,
  addApprovedUserToWelcomeSpace,
};
