// hash-password.js
const bcrypt = require('bcrypt');

async function hashPassword() {
  const password = '123456';
  const saltRounds = 10;

  const hashed = await bcrypt.hash(password, saltRounds);
  console.log('Hashed password:', hashed);
}

hashPassword();