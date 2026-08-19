const DEFAULT_WISH_TEXT = [
  'Dear {name},',
  '',
  'Wishing you a very Happy Birthday! 🎂✨',
  '',
  'May this special day mark the beginning of another wonderful year filled with happiness 😊, good health, success, and new opportunities.',
  '',
  'Your association with Urbancode is truly valued, and we appreciate the contribution, dedication, and positive spirit you bring to our journey 🙌.',
  '',
  'May you continue to grow, achieve greater milestones, and turn every opportunity into success.',
  '',
  'Warm wishes,',
  'Team Urbancode Edutech 🎓',
  'Together We Always Learn to Grow',
].join('\n');

const unescapeEnvText = (value) =>
  String(value || '')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t');

const firstNameOf = (name) => {
  const trimmed = String(name || '').trim();
  if (!trimmed) return 'Team member';
  return trimmed.split(/\s+/)[0];
};

/**
 * Build the chat message. Placeholders:
 * {name} {firstName} {position} {company} {employeeId}
 *
 * Override via BIRTHDAY_WISH_TEXT in .env (use \n for new lines).
 */
const buildBirthdayWishText = (user = {}, template) => {
  const raw =
    template != null && String(template).trim()
      ? unescapeEnvText(template)
      : process.env.BIRTHDAY_WISH_TEXT && String(process.env.BIRTHDAY_WISH_TEXT).trim()
        ? unescapeEnvText(process.env.BIRTHDAY_WISH_TEXT)
        : DEFAULT_WISH_TEXT;

  const name = String(user.name || '').trim() || 'Team member';
  const replacements = {
    name,
    firstName: firstNameOf(name),
    position: String(user.position || '').trim() || 'Team member',
    company: String(user.company || '').trim() || 'Urbancode',
    employeeId: String(user.employeeId || '').trim() || '',
  };

  return raw.replace(/\{(name|firstName|position|company|employeeId)\}/g, (_, key) => replacements[key]);
};

module.exports = {
  DEFAULT_WISH_TEXT,
  unescapeEnvText,
  firstNameOf,
  buildBirthdayWishText,
};
