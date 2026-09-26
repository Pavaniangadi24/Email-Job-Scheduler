import nodemailer from 'nodemailer';

async function main() {
  const account = await nodemailer.createTestAccount();
  console.log(`ETHEREAL_USER=${account.user}`);
  console.log(`ETHEREAL_PASS=${account.pass}`);
  console.log('Keep these credentials in .env only. Preview sent messages at https://ethereal.email/messages');
}

main().catch(error => { console.error(error); process.exit(1); });