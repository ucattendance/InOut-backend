const { unescapeEnvText, firstNameOf } = require('./birthdayWishMessage');

const DEFAULT_WISH_TEXT = [
  'Dear {name},',
  '',
  '🎉 *Congratulations on completing another wonderful year with Urbancode!* 🎉',
  '',
  'Your dedication, contribution, and commitment have been an important part of our journey. We truly appreciate the value you bring to the Urbancode family. 🙏',
  '',
  'May the years ahead bring you greater achievements, exciting opportunities, continuous growth, and success. 🚀✨',
  '',
  'Thank you for being a valued part of our journey. We look forward to celebrating many more milestones together! 🥂',
  '',
  'Warm wishes,',
  '*Team Urbancode Edutech* 💙',
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
