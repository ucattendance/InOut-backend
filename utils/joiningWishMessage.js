const { unescapeEnvText, firstNameOf } = require('./birthdayWishMessage');

const DEFAULT_WISH_TEXT = [
  'Dear {name},',
  '',
  'Congratulations on completing {years} year(s) with Urbancode! 🎉✨',
  '',
  'Thank you for your dedication, hard work, and the positive energy you bring every day 🙌.',
  '',
  'We are proud to have you on the team and look forward to many more milestones together.',
  '',
  'Warm wishes,',
  'Team Urbancode Edutech 🎓',
  'Together We Always Learn to Grow',
].join('\n');

/**
 * Build the chat message. Placeholders:
 * {name} {firstName} {position} {company} {employeeId} {years}
 *
 * Override via JOINING_WISH_TEXT in .env (use \n for new lines).
 */
const buildJoiningWishText = (user = {}, yearsOfService = 1, template) => {
  const raw =
    template != null && String(template).trim()
      ? unescapeEnvText(template)
      : process.env.JOINING_WISH_TEXT && String(process.env.JOINING_WISH_TEXT).trim()
        ? unescapeEnvText(process.env.JOINING_WISH_TEXT)
        : DEFAULT_WISH_TEXT;

  const name = String(user.name || '').trim() || 'Team member';
  const years = Math.max(1, Number(yearsOfService) || 1);
  const replacements = {
    name,
    firstName: firstNameOf(name),
    position: String(user.position || '').trim() || 'Team member',
    company: String(user.company || '').trim() || 'Urbancode',
    employeeId: String(user.employeeId || '').trim() || '',
    years: String(years),
  };

  return raw.replace(
    /\{(name|firstName|position|company|employeeId|years)\}/g,
    (_, key) => replacements[key]
  );
};

module.exports = {
  DEFAULT_WISH_TEXT,
  buildJoiningWishText,
};
