import nodemailer from 'nodemailer';
import { config } from '../config';

const transporter = nodemailer.createTransport({
  host: config.ETHEREAL_HOST,
  port: config.ETHEREAL_PORT,
  secure: config.ETHEREAL_PORT === 465,
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 60000,
  auth: config.ETHEREAL_USER && config.ETHEREAL_PASS ? { user: config.ETHEREAL_USER, pass: config.ETHEREAL_PASS } : undefined,
});

export async function sendEmail(input: { from: string; to: string; subject: string; text: string }) {
  if (!config.ETHEREAL_USER || !config.ETHEREAL_PASS) throw new Error('Ethereal SMTP credentials are not configured');
  return transporter.sendMail(input);
}