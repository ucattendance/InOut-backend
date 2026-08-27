const { unescapeEnvText, firstNameOf } = require('./birthdayWishMessage');

const DEFAULT_WISH_TEXT = [
  '_Welcome to Urbancode Edutech Solutions Pvt. Ltd.!_ 🎉',
  '',
  'We are truly delighted to welcome you to the Urbancode family. 💙 At Urbancode, we believe our people are our greatest asset, and we are excited to have you join our growing journey.',
  '',
  'As you begin this new chapter, we encourage you to learn, collaborate, and innovate. ✨ Your unique skills and ideas are highly valued, and we are confident that your contribution will make a significant difference to our success.',
  '',
  'We look forward to building great things together and wish you a successful, rewarding, and fulfilling career with us. Welcome aboard! ☺',
  '',
  'Team Urbancode Edutech Solutions Pvt. Ltd.🤗',
].join('\n');

/**
 * Build the chat message. Placeholders:
 * {name} {firstName} {position} {company} {employeeId}
 *
 * Override via NEW_USER_WISH_TEXT in .env (use \n for new lines).
 */
const buildNewUserWishText = (user = {}, template) => {
  const raw =
    template != null && String(template).trim()
      ? unescapeEnvText(template)
      : process.env.NEW_USER_WISH_TEXT && String(process.env.NEW_USER_WISH_TEXT).trim()
        ? unescapeEnvText(process.env.NEW_USER_WISH_TEXT)
        : DEFAULT_WISH_TEXT;

  const name = String(user.name || '').trim() || 'Team member';
  const replacements = {
    name,
    firstName: firstNameOf(name),
    position: String(user.position || '').trim() || 'Team member',
    company: String(user.company || '').trim() || 'Urbancode',
    employeeId: String(user.employeeId || '').trim() || '',
  };

  return raw.replace(
    /\{(name|firstName|position|company|employeeId)\}/g,
    (_, key) => replacements[key]
  );
};

module.exports = {
  DEFAULT_WISH_TEXT,
  buildNewUserWishText,
};
