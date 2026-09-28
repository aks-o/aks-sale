import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { get } from './database.js';

dotenv.config();

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';

const FROM_EMAIL = process.env.FROM_EMAIL || 'info@aks-sale.com';
const FROM_NAME = process.env.FROM_NAME || 'AKS Sales Team';

let transporter;

const getTransporter = () => {
  if (!transporter) {
    if (SMTP_USER && SMTP_PASS) {
      transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS
        }
      });
    } else {
      transporter = nodemailer.createTransport({
        jsonTransport: true
      });
    }
  }
  return transporter;
};

export const sendEmail = async (to, subject, htmlContent, options = {}) => {
  const fullHtml = addUnsubscribeFooter(htmlContent, options.unsubscribeUrl, options.siteUrl);

  try {
    const transp = getTransporter();
    const info = await transp.sendMail({
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
      to,
      subject,
      html: fullHtml
    });

    if (options.contactId) {
      const { run } = await import('./database.js');
      await run(
        'INSERT INTO email_logs (contact_id, deal_id, email_type, subject, body, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          options.contactId || null,
          options.dealId || null,
          options.emailType || 'manual',
          subject,
          fullHtml,
          info.messageId ? 'sent' : 'queued',
          options.createdBy || 'automation'
        ]
      );
    }

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Email send error:', error.message);
    if (options.contactId) {
      const { run } = await import('./database.js');
      await run(
        'INSERT INTO email_logs (contact_id, deal_id, email_type, subject, body, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          options.contactId || null,
          options.dealId || null,
          options.emailType || 'manual',
          subject,
          fullHtml,
          'failed',
          options.createdBy || 'automation'
        ]
      );
    }
    return { success: false, error: error.message };
  }
 };

const addUnsubscribeFooter = (html, unsubscribeUrl, siteUrl) => {
  const footer = `
    <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 30px; text-align: center; font-size: 12px; color: #9ca3af;">
      <p style="margin-bottom: 8px;">
        You received this email because you expressed interest in AKS Sales products.
      </p>
      <p style="margin: 0;">
        <a href="${unsubscribeUrl || '#'}" style="color: #6b7280; text-decoration: underline;">Unsubscribe</a>
        | <a href="${siteUrl || '/'}" style="color: #6b7280; text-decoration: underline;">Visit our website</a>
      </p>
    </div>`;
  return `${html}${footer}`;
};

export const renderTemplate = (templateName, variables = {}) => {
  const templates = {
     welcome_digital: (v) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="background: #2563eb; color: white; padding: 30px; text-align: center;">
          <h1 style="margin: 0; font-size: 28px;">Welcome to AKS Solutions</h1>
        </div>
        <div style="padding: 30px;">
          <p>Hi ${v.name || 'there'},</p>
          <p>Thank you for your interest in our <strong>${v.product || 'solutions'}</strong>. I'm excited to help you get started!</p>
          <p>Based on your inquiry, here's a quick overview of what we can build for you:</p>
           <ul style="line-height: 1.8;">
             <li><strong>Small Tools (from ₹12,000):</strong> Quick, cost-effective utilities tailored to your workflow</li>
             <li><strong>Software (from ₹1,00,000):</strong> Custom applications designed for your specific needs</li>
             <li><strong>Websites (from ₹24,000):</strong> Professional, high-converting web presences</li>
             <li style="color: #059669;"><strong>All prices shown in USD and INR</strong></li>
           </ul>
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <p style="font-size: 18px; margin: 0;">Ready to move forward?</p>
            <a href="${v.siteUrl}/contact" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 10px;">Book a Quick Call</a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">Reply to this email if you have any questions!</p>
        </div>
      </div>
    `,

    welcome_mining: (v) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="background: #0f172a; color: white; padding: 30px; text-align: center;">
          <h1 style="margin: 0; font-size: 28px;">AKS Mining Platform</h1>
          <p style="margin: 5px 0 0; color: #94a3bc; font-size: 16px;">Industrial Solutions for Crushing & Processing</p>
        </div>
        <div style="padding: 30px;">
          <p>Hi ${v.name || 'there'},</p>
          <p>Thank you for your inquiry about our Mining & Crushing Platform. This is a high-ticket solution and we want to make sure it's the right fit for your operation.</p>
          <p>I've attached our technical brochure and capabilities document. Here's a quick summary:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr style="background: #f3f4f6;">
              <td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>Capacity</strong></td>
              <td style="padding: 10px; border: 1px solid #e5e7eb;">50-500 TPH</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>Applications</strong></td>
              <td style="padding: 10px; border: 1px solid #e5e7eb;">Stone, gravel, concrete, mining</td>
            </tr>
            <tr style="background: #f3f4f6;">
              <td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>Pricing (USD)</strong></td>
              <td style="padding: 10px; border: 1px solid #e5e7eb;">$50,000 - $150,000+</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>Pricing (INR)</strong></td>
              <td style="padding: 10px; border: 1px solid #e5e7eb;">From ₹30,00,000</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>Deployment</strong></td>
              <td style="padding: 10px; border: 1px solid #e5e7eb;">30-90 days</td>
            </tr>
          </table>
          <div style="background: #fef3c7; border: 1px solid #fbbf24; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <p style="font-size: 18px; margin: 0 0 10px;"><strong>Next Step: Book a Call</strong></p>
            <p style="margin: 0 0 15px; font-size: 14px;">Let's discuss your current production capacity and targets.</p>
            <a href="${v.bookingUrl}" style="display: inline-block; background: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Schedule Site Assessment</a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">I'll follow up within 48 hours to ensure you have everything you need.</p>
        </div>
      </div>
    `,

    followup_digital: (v) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="background: #059669; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">Quick Update on Your ${v.product || ''} Inquiry</h1>
        </div>
        <div style="padding: 30px;">
          <p>Hi ${v.name || 'there'},</p>
          <p>I wanted to follow up on my previous email about our ${v.product || 'solutions'} services.</p>
          <p>Many of our clients see remarkable results with our approach:</p>
          <blockquote style="border-left: 4px solid #2563eb; padding-left: 20px; margin: 20px 0; font-style: italic;">
            "${v.testimonial || 'Our clients consistently report 40-60% improvement in efficiency after implementation.'}"
          </blockquote>
          <p>Would now be a good time to discuss your project in more detail?</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${v.siteUrl}/contact" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Reply or Schedule a Call</a>
          </div>
        </div>
      </div>
    `,

     offer_digital: (v) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
         <div style="background: #dc2626; color: white; padding: 20px; text-align: center;">
           <h1 style="margin: 0; font-size: 24px;">Special Offer - Limited Time</h1>
           <p style="margin: 10px 0 0; font-size: 18px;">Best price locked in if you decide this week</p>
         </div>
        <div style="padding: 30px;">
          <p>Hi ${v.name || 'there'},</p>
          <p>This is a <strong>limited-time offer</strong> exclusively for you:</p>
          <ul style="line-height: 1.8;">
            <li>Best price locked in for your ${v.product || ''} project (in USD or INR)</li>
            <li>Free consultation and requirements analysis</li>
            <li>Priority scheduling</li>
          </ul>
          <p style="font-size: 18px;"><strong>This offer expires in 48 hours.</strong></p>
          <div style="background: #fef3c7; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <p style="font-size: 16px; margin: 0 0 10px;"><strong>Claim this offer now</strong></p>
            <a href="${v.siteUrl}/contact" style="display: inline-block; background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Claim Offer</a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">Questions? Just reply to this email.</p>
        </div>
      </div>
    `,

    reminder_mining: (v) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="background: #2563eb; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">Following Up on Mining Platform</h1>
        </div>
        <div style="padding: 30px;">
          <p>Hi ${v.name || 'there'},</p>
          <p>Did you have a chance to review the information I sent about our Mining & Crushing Platform?</p>
          <p>I'm here to discuss your current production capacity and targets. Even a brief 15-minute call can help determine if our solution is a good fit for your operation.</p>
          <div style="text-align: center; padding: 20px; background: #f3f4f6; border-radius: 8px;">
            <p style="font-size: 16px; margin: 0 0 10px;">Available times this week:</p>
            <a href="${v.bookingUrl}" style="display: inline-block; background: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Book Your Call</a>
          </div>
          <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">Alternatively, just reply with a few questions and I'll answer them directly.</p>
        </div>
      </div>
    `,

    checkin_digital: (v) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="background: #6d28d9; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">Quick Check-In</h1>
        </div>
        <div style="padding: 30px;">
          <p>Hi ${v.name || 'there'},</p>
          <p>Just checking in - are you still interested in our ${v.product || ''} services?</p>
          <p>No pressure at all - I just want to make sure you have everything you need to make a decision.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${v.siteUrl}/contact" style="display: inline-block; background: #6d28d9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Contact Me</a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">If now isn't the right time, just let me know and I'll check back later.</p>
        </div>
      </div>
    `
  };

  const template = templates[templateName];
  if (!template) {
    throw new Error(`Unknown template: ${templateName}`);
  }
  return template(variables);
};

export default { sendEmail, renderTemplate };