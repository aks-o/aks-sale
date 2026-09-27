import { run, get, all } from '../database.js';
import { sendEmail, renderTemplate } from '../emailService.js';
import dotenv from 'dotenv';

dotenv.config();

const SITE_URL = process.env.SITE_URL || 'http://localhost:3000';

const DIGITAL_SEQUENCE = [
  { day: 0, template: 'welcome_digital', subject: 'Here\'s what you asked for', emailType: 'welcome_digital' },
  { day: 2, template: 'followup_digital', subject: 'Quick update on your inquiry', emailType: 'followup_digital' },
  { day: 4, template: 'offer_digital', subject: 'Special limited-time offer inside', emailType: 'offer_digital' },
  { day: 7, template: 'checkin_digital', subject: 'Quick check-in', emailType: 'checkin_digital' },
];

const MINING_SEQUENCE = [
  { day: 0, template: 'welcome_mining', subject: 'AKS Mining Platform - Technical Overview', emailType: 'welcome_mining' },
  { day: 3, template: 'reminder_mining', subject: 'Following up on mining platform', emailType: 'reminder_mining' },
];

const crypto = await import('crypto');

export const createContactAndDeal = async (contactData) => {
  const { name, email, phone, company, productInterest, description, source = 'Website form' } = contactData;

  const unsubscribeToken = crypto.randomBytes(32).toString('hex');

  const existing = await get('SELECT * FROM contacts WHERE email = ?', [email]);

  if (existing) {
    await run(
      'UPDATE contacts SET name = ?, phone = ?, company = ?, product_interest = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?',
      [name, phone || null, company || null, productInterest, description || null, email]
    );
  } else {
    await run(
      'INSERT INTO contacts (name, email, phone, company, product_interest, source, description, unsubscribe_token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [name, email, phone || null, company || null, productInterest, source, description || null, unsubscribeToken]
    );
  }

  const contact = existing || await get('SELECT * FROM contacts WHERE email = ?', [email]);

  let dealResult;
  const existingDeal = await get('SELECT id FROM deals WHERE contact_id = ? ORDER BY created_at DESC LIMIT 1', [contact.id]);

  const isMining = productInterest === 'Mining & crushing platform';
  const productLabel = isMining ? 'Mining & Crushing Platform' : productInterest;
  const pipeline = isMining ? 'mining' : 'digital';
  let dealStages = isMining ? 'New Inquiry' : 'New Lead';

  if (existingDeal) {
    await run(
      'UPDATE deals SET title = ?, product_type = ?, pipeline = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [`${productLabel} - ${name}`, productInterest, pipeline, existingDeal.id]
    );
    dealResult = { id: existingDeal.id };

    await run(
      'INSERT INTO notes (contact_id, deal_id, content, type) VALUES (?, ?, ?, ?)',
      [contact.id, existingDeal.id, `Contact ${existing ? 'updated' : 're-submitted'} interest: ${productInterest}`, 'system']
    );
  } else {
    dealResult = await run(
      'INSERT INTO deals (contact_id, title, product_type, pipeline, stage, value, probability, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [
        contact.id,
        `${productLabel} - ${name}`,
        productInterest,
        pipeline,
        dealStages,
        isMining ? 50000 : 1000,
        10
      ]
    );
  }

  if (isMining) {
    await run(
      'INSERT INTO tasks (deal_id, contact_id, title, description, assigned_to, due_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
      [
        dealResult.id,
        contact.id,
        'Call this lead within 24 hours',
        `High-priority mining platform inquiry from ${name}. Discuss current production capacity and targets.`,
        process.env.ADMIN_EMAIL || 'admin@aks-sale.com',
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        'pending'
      ]
    );
  }

  await scheduleAutomation(contact.id, productInterest, dealResult.id);

  return { contactId: contact.id, dealId: dealResult.id, isMining };
};

export const scheduleAutomation = async (contactId, productInterest, dealId) => {
  const isMining = productInterest === 'Mining & crushing platform';
  const sequenceType = isMining ? 'mining' : 'digital';
  const sequence = isMining ? MINING_SEQUENCE : DIGITAL_SEQUENCE;

  await run(
    'UPDATE automation_state SET paused = 1, updated_at = CURRENT_TIMESTAMP WHERE contact_id = ? AND paused = 0',
    [contactId]
  );

  const contact = await get('SELECT name, email, phone, product_interest, unsubscribe_token FROM contacts WHERE id = ?', [contactId]);

  if (contact && sequence[0]) {
    const templateVars = {
      name: contact.name,
      email: contact.email,
      product: contact.product_interest,
      siteUrl: SITE_URL,
      bookingUrl: `${SITE_URL}/booking`,
      unsubscribeUrl: `${SITE_URL}/unsubscribe/${contact.unsubscribe_token}`
    };

    const html = renderTemplate(sequence[0].template, templateVars);
    await sendEmail(contact.email, sequence[0].subject, html, {
      contactId: contactId,
      dealId: dealId,
      emailType: sequence[0].emailType,
      unsubscribeUrl: templateVars.unsubscribeUrl,
      siteUrl: SITE_URL
    });
  }

  let nextEmailAt = null;
  if (sequence[1]) {
    nextEmailAt = new Date(Date.now() + sequence[1].day * 24 * 60 * 60 * 1000).toISOString();
  }

  await run(
    'INSERT INTO automation_state (contact_id, sequence_type, sequence_length, current_step, next_email_at, paused, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
    [
      contactId,
      sequenceType,
      sequence.length,
      0,
      nextEmailAt
    ]
  );

  return { sequenceType, sequenceLength: sequence.length, day0EmailSent: true };
};

export const processAutomationQueue = async () => {
  const now = new Date().toISOString();

  const pending = await all(
    `
    SELECT a.*, c.email, c.name, c.phone, c.product_interest, c.unsubscribe_token
    FROM automation_state a
    JOIN contacts c ON a.contact_id = c.id
    WHERE a.paused = 0
    AND a.current_step < a.sequence_length - 1
    AND a.next_email_at <= ?
    `,
    [now]
  );

  const results = [];

  for (const item of pending) {
    try {
      const sequence = item.sequence_type === 'mining' ? MINING_SEQUENCE : DIGITAL_SEQUENCE;
      const nextStep = item.current_step + 1;

      if (nextStep >= sequence.length) {
        await run('UPDATE automation_state SET paused = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [item.id]);
        continue;
      }

      const stepConfig = sequence[nextStep];
      const templateVars = {
        name: item.name,
        email: item.email,
        product: item.product_interest,
        siteUrl: SITE_URL,
        bookingUrl: `${SITE_URL}/booking`,
        unsubscribeUrl: `${SITE_URL}/unsubscribe/${item.unsubscribe_token}`
      };

      const html = renderTemplate(stepConfig.template, templateVars);
      const subject = stepConfig.subject;

      const deal = await get('SELECT id FROM deals WHERE contact_id = ? ORDER BY created_at DESC LIMIT 1', [item.contact_id]);

      const result = await sendEmail(item.email, subject, html, {
        contactId: item.contact_id,
        dealId: deal?.id,
        emailType: stepConfig.emailType,
        unsubscribeUrl: templateVars.unsubscribeUrl,
        siteUrl: SITE_URL
      });

      const nextStepAfter = nextStep + 1;
      let nextEmailAt = null;
      if (nextStepAfter < sequence.length) {
        const baseTime = new Date(item.created_at);
        nextEmailAt = new Date(baseTime.getTime() + sequence[nextStepAfter].day * 24 * 60 * 60 * 1000).toISOString();
      }

      if (nextStepAfter >= sequence.length) {
        await run(
          'UPDATE automation_state SET current_step = ?, next_email_at = ?, paused = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [nextStep, nextEmailAt, item.id]
        );
      } else {
        await run(
          'UPDATE automation_state SET current_step = ?, next_email_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [nextStep, nextEmailAt, item.id]
        );
      }

      results.push({ contactId: item.contact_id, success: result.success, step: nextStep });
    } catch (error) {
      console.error(`Automation error for contact ${item.contact_id}:`, error.message);
      results.push({ contactId: item.contact_id, success: false, error: error.message });
    }
  }

  return results;
};

export const processDueReminders = async () => {
  const now = new Date().toISOString();

  const staleLeads = await all(
    `
    SELECT d.id as deal_id, d.contact_id, c.name, c.email, d.stage, d.created_at
    FROM deals d
    JOIN contacts c ON d.contact_id = c.id
    WHERE (d.stage = 'New Lead' OR d.stage = 'New Inquiry')
    AND d.updated_at < ?
    AND d.id NOT IN (
      SELECT deal_id FROM tasks WHERE deal_id = d.id AND status = 'completed' AND due_date >= ?
    )
    `,
    [new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()]
  );

  const results = [];

  for (const lead of staleLeads) {
    const existingTask = await get(
      'SELECT id FROM tasks WHERE deal_id = ? AND title LIKE ? AND status = ?',
      [lead.deal_id, '%Follow up%', 'pending']
    );

    if (!existingTask) {
      await run(
        'INSERT INTO tasks (deal_id, contact_id, title, description, assigned_to, due_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
        [
          lead.deal_id,
          lead.contact_id,
          'Follow up with ' + lead.name + ' today',
          'No response in 7+ days. This lead needs personal follow-up.',
          process.env.ADMIN_EMAIL || 'admin@aks-sale.com',
          now,
          'pending'
        ]
      );

      results.push({ dealId: lead.deal_id, contactId: lead.contact_id, taskCreated: true });
    }
  }

  return results;
};

export const getAutomationState = async (contactId) => {
  return await get('SELECT * FROM automation_state WHERE contact_id = ? ORDER BY id DESC LIMIT 1', [contactId]);
};

export const pauseAutomation = async (contactId) => {
  return await run('UPDATE automation_state SET paused = 1, updated_at = CURRENT_TIMESTAMP WHERE contact_id = ?', [contactId]);
};

export const addLeadScore = async (contactId, points, event = 'manual') => {
  const contact = await get('SELECT lead_score FROM contacts WHERE id = ?', [contactId]);
  if (!contact) return false;

  await run('UPDATE contacts SET lead_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [contact.lead_score + points, contactId]);

  const automationState = await get('SELECT * FROM automation_state WHERE contact_id = ? AND paused = 0', [contactId]);
  if (automationState && contact.lead_score + points >= 10) {
    await run('UPDATE automation_state SET paused = 1, updated_at = CURRENT_TIMESTAMP WHERE contact_id = ?', [contactId]);
  }

  return true;
};

export default {
  createContactAndDeal,
  scheduleAutomation,
  processAutomationQueue,
  processDueReminders,
  getAutomationState,
  pauseAutomation,
  addLeadScore,
  DIGITAL_SEQUENCE,
  MINING_SEQUENCE
};