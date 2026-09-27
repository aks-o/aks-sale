import express from 'express';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { run, get, all } from '../database.js';
import { createContactAndDeal, processAutomationQueue, processDueReminders, getAutomationState, pauseAutomation, addLeadScore } from '../automation/workflowEngine.js';

dotenv.config();

const router = express.Router();

const generateToken = (user) => {
  const payload = Buffer.from(`${user.id}:${user.email}:${Date.now()}`).toString('base64');
  return payload;
};

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.substring(7);
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const parts = decoded.split(':');
    const userId = parseInt(parts[0]);

    const user = await get('SELECT id, name, email, role FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

router.post('/leads', async (req, res) => {
  try {
    const { name, email, phone, company, productInterest, description, source } = req.body;

    if (!name || !email || !productInterest) {
      return res.status(400).json({ error: 'Name, email, and product interest are required' });
    }

    const result = await createContactAndDeal({
      name,
      email: email.toLowerCase().trim(),
      phone,
      company,
      description,
      productInterest,
      source: source || 'Website form'
    });

    res.status(201).json({
      message: 'Lead captured successfully',
      contactId: result.contactId,
      dealId: result.dealId,
      isMining: result.isMining
    });
  } catch (error) {
    console.error('Lead capture error:', error);
    res.status(500).json({ error: 'Failed to capture lead' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await get('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user);

    res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/dashboard', verifyToken, async (req, res) => {
  try {
    const stats = await get(`
      SELECT 
        (SELECT COUNT(*) FROM contacts) as total_leads,
        (SELECT COUNT(*) FROM deals) as total_deals,
        (SELECT COUNT(*) FROM deals WHERE stage LIKE '%on%' OR stage IN ('Proposal Sent', 'Negotiation') AND pipeline = 'mining') as hot_deals,
        (SELECT COUNT(*) FROM tasks WHERE status = 'pending') as pending_tasks,
        (SELECT COUNT(*) FROM contacts WHERE lead_score >= 10) as warm_leads,
        (SELECT COALESCE(SUM(value), 0) FROM deals WHERE stage = 'Won') as total_revenue
    `);

    const pipeline = await all(`
      SELECT stage, COUNT(*) as count, product_type, pipeline
      FROM deals
      GROUP BY stage, product_type, pipeline
      ORDER BY pipeline, stage
    `);

    const recentLeads = await all(`
      SELECT c.name, c.email, c.phone, c.product_interest, c.lead_score, c.created_at, d.stage, d.pipeline
      FROM contacts c
      JOIN deals d ON c.id = d.contact_id
      ORDER BY c.created_at DESC
      LIMIT 10
    `);

    const upcomingTasks = await all(`
      SELECT t.title, t.description, t.due_date, c.name, c.email, d.title as deal_title, d.pipeline
      FROM tasks t
      JOIN contacts c ON t.contact_id = c.id
      JOIN deals d ON t.deal_id = d.id
      WHERE t.status = 'pending'
      ORDER BY t.due_date ASC
      LIMIT 10
    `);

    res.json({ stats, pipeline, recentLeads, upcomingTasks });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

router.get('/contacts', verifyToken, async (req, res) => {
  try {
    const contacts = await all(`
      SELECT c.*, d.stage as deal_stage, d.pipeline, d.value as deal_value
      FROM contacts c
      LEFT JOIN deals d ON c.id = d.contact_id AND d.created_at = (
        SELECT MAX(created_at) FROM deals WHERE contact_id = c.id
      )
      ORDER BY c.created_at DESC
    `);
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

router.get('/contacts/:id', verifyToken, async (req, res) => {
  try {
     const contact = await get('SELECT id, name, email, phone, company, product_interest, source, lead_score, description, created_at, updated_at FROM contacts WHERE id = ?', [req.params.id]);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const deals = await all('SELECT * FROM deals WHERE contact_id = ? ORDER BY created_at DESC', [contact.id]);
    const tasks = await all('SELECT * FROM tasks WHERE contact_id = ? ORDER BY created_at DESC', [contact.id]);
    const emails = await all(
      'SELECT email_type, subject, sent_at, status FROM email_logs WHERE contact_id = ? ORDER BY sent_at DESC',
      [contact.id]
    );
    const automation = await getAutomationState(contact.id);
    const notes = await all(
      'SELECT n.*, u.name as user_name FROM notes n LEFT JOIN users u ON n.user_id = u.id WHERE n.contact_id = ? ORDER BY n.created_at DESC',
      [contact.id]
    );

    res.json({ contact, deals, tasks, emails, notes, automation });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch contact' });
  }
});

router.get('/deals', verifyToken, async (req, res) => {
  try {
    const { pipeline, stage, search } = req.query;
    let sql = `
      SELECT d.*, c.name, c.email, c.phone, c.product_interest, c.lead_score
      FROM deals d
      JOIN contacts c ON d.contact_id = c.id
    `;
    const params = [];
    const conditions = [];

    if (pipeline) {
      conditions.push('d.pipeline = ?');
      params.push(pipeline);
    }
    if (stage) {
      conditions.push('d.stage = ?');
      params.push(stage);
    }
    if (search) {
      conditions.push('(c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)');
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY d.created_at DESC';

    const deals = await all(sql, params);
    res.json(deals);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch deals' });
  }
});

router.put('/deals/:id/stage', verifyToken, async (req, res) => {
  try {
    const { stage } = req.body;
    const deal = await get('SELECT * FROM deals WHERE id = ?', [req.params.id]);
    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    await run(
      'UPDATE deals SET stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [stage, req.params.id]
    );

    if (stage === 'Lost' || stage === 'Won') {
      await pauseAutomation(deal.contact_id);
    }

    res.json({ message: 'Deal stage updated', stage });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update deal stage' });
  }
});

router.get('/tasks', verifyToken, async (req, res) => {
  try {
    const { status = 'pending' } = req.query;
    const tasks = await all(`
      SELECT t.*, c.name as contact_name, c.email, d.title as deal_title, d.pipeline
      FROM tasks t
      JOIN contacts c ON t.contact_id = c.id
      JOIN deals d ON t.deal_id = d.id
      WHERE t.status = ?
      ORDER BY t.due_date ASC
    `, [status]);
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

router.put('/tasks/:id/complete', verifyToken, async (req, res) => {
  try {
    await run(
      'UPDATE tasks SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['completed', req.params.id]
    );
    res.json({ message: 'Task completed' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to complete task' });
  }
});

router.put('/tasks/:id/reopen', verifyToken, async (req, res) => {
  try {
    await run(
      'UPDATE tasks SET status = ?, completed_at = NULL WHERE id = ?',
      ['pending', req.params.id]
    );
    res.json({ message: 'Task reopened' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reopen task' });
  }
});

router.get('/emails', verifyToken, async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const emails = await all(`
      SELECT e.*, c.name as contact_name, c.email as contact_email
      FROM email_logs e
      LEFT JOIN contacts c ON e.contact_id = c.id
      ORDER BY e.sent_at DESC
      LIMIT ?
    `, [parseInt(limit)]);
    res.json(emails);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

router.post('/emails/send', verifyToken, async (req, res) => {
  try {
    const { contactId, subject, htmlContent } = req.body;

    const contact = await get('SELECT email, name FROM contacts WHERE id = ?', [contactId]);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const { sendEmail } = await import('../emailService.js');
    const result = await sendEmail(contact.email, subject, htmlContent, {
      contactId,
      emailType: 'manual',
      createdBy: req.user.email
    });

    if (result.success) {
      res.json({ message: 'Email sent successfully', messageId: result.messageId });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to send email' });
  }
});

router.post('/automation/process', verifyToken, async (req, res) => {
  try {
    const emailResults = await processAutomationQueue();
    const reminderResults = await processDueReminders();

    res.json({
      message: 'Automation processed',
      emails: emailResults,
      reminders: reminderResults
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to process automation' });
  }
});

router.put('/contacts/:id/score', verifyToken, async (req, res) => {
  try {
    const { points, event } = req.body;
    await addLeadScore(parseInt(req.params.id), points, event || 'manual');
    const contact = await get('SELECT lead_score FROM contacts WHERE id = ?', [req.params.id]);
    res.json({ message: 'Score updated', leadScore: contact.lead_score });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update score' });
  }
});

router.get('/stats/pipeline', verifyToken, async (req, res) => {
  try {
    const stats = await all(`
      SELECT 
        pipeline,
        product_type,
        stage,
        COUNT(*) as deal_count,
        AVG(value) as avg_value
      FROM deals
      GROUP BY pipeline, product_type, stage
      ORDER BY pipeline, stage
    `);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pipeline stats' });
  }
});

router.get('/stats/product-interest', verifyToken, async (req, res) => {
  try {
    const stats = await all(`
      SELECT 
        c.product_interest,
        COUNT(*) as lead_count,
        SUM(CASE WHEN d.stage = 'Won' THEN 1 ELSE 0 END) as won_deals,
        AVG(c.lead_score) as avg_score
      FROM contacts c
      LEFT JOIN deals d ON c.id = d.contact_id
      GROUP BY c.product_interest
      ORDER BY lead_count DESC
    `);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch product interest stats' });
  }
});

router.get('/contacts/:id/timeline', verifyToken, async (req, res) => {
  try {
    const timeline = await all(`
      SELECT 'email' as type, e.sent_at as timestamp, e.subject, e.status, 
             c.email as contact_email, '' as description
      FROM email_logs e
      JOIN contacts c ON e.contact_id = c.id
      WHERE c.id = ?
      UNION ALL
      SELECT 'task' as type, t.created_at as timestamp, t.title as subject, t.status,
             c.email as contact_email, t.description
      FROM tasks t
      JOIN contacts c ON t.contact_id = c.id
      WHERE c.id = ?
      UNION ALL
      SELECT 'note' as type, n.created_at as timestamp, n.type as subject, 'manual' as status,
             c.email as contact_email, n.content as description
      FROM notes n
      JOIN contacts c ON n.contact_id = c.id
      WHERE c.id = ?
      UNION ALL
      SELECT 'deal_update' as type, d.updated_at as timestamp, d.title as subject, d.stage as status,
             c.email as contact_email, d.product_type as description
      FROM deals d
      JOIN contacts c ON d.contact_id = c.id
      WHERE c.id = ?
      ORDER BY timestamp DESC
      LIMIT 50
    `, [req.params.id, req.params.id, req.params.id, req.params.id]);

    res.json(timeline);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch timeline' });
  }
});

router.post('/contacts/:id/note', verifyToken, async (req, res) => {
  try {
    const { content, type = 'manual' } = req.body;
    const contact = await get('SELECT id FROM contacts WHERE id = ?', [req.params.id]);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const result = await run(
      'INSERT INTO notes (contact_id, deal_id, user_id, content, type) VALUES (?, ?, ?, ?, ?)',
      [contact.id, null, req.user.id, content, type]
    );

    res.status(201).json({ message: 'Note added', noteId: result.id });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add note' });
  }
});

router.get('/contacts/:id/notes', verifyToken, async (req, res) => {
  try {
    const notes = await all(
      'SELECT n.*, u.name as user_name FROM notes n LEFT JOIN users u ON n.user_id = u.id WHERE contact_id = ? ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json(notes);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

router.post('/emails/:id/resend', verifyToken, async (req, res) => {
  try {
    const emailLog = await get(
      'SELECT e.*, c.email, c.name FROM email_logs e JOIN contacts c ON e.contact_id = c.id WHERE e.id = ?',
      [req.params.id]
    );
    if (!emailLog) {
      return res.status(404).json({ error: 'Email not found' });
    }

    const { sendEmail } = await import('../emailService.js');
    const result = await sendEmail(emailLog.email, emailLog.subject, emailLog.body, {
      contactId: emailLog.contact_id,
      dealId: emailLog.deal_id,
      emailType: emailLog.email_type,
      createdBy: req.user.email
    });

    if (result.success) {
      res.json({ message: 'Email resent successfully', messageId: result.messageId });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to resend email' });
  }
});

router.get('/automation/status', verifyToken, async (req, res) => {
  try {
    const now = new Date().toISOString();
    const queued = await all(`
      SELECT a.*, c.name, c.email, c.product_interest
      FROM automation_state a
      JOIN contacts c ON a.contact_id = c.id
      WHERE a.paused = 0 AND a.next_email_at <= ?
      ORDER BY a.next_email_at ASC
    `, [now]);

    const scheduled = await all(`
      SELECT a.*, c.name, c.email, c.product_interest
      FROM automation_state a
      JOIN contacts c ON a.contact_id = c.id
      WHERE a.paused = 0 AND a.next_email_at > ?
      ORDER BY a.next_email_at ASC
    `, [now]);

    const paused = await all(`
      SELECT a.*, c.name, c.email
      FROM automation_state a
      JOIN contacts c ON a.contact_id = c.id
      WHERE a.paused = 1
      ORDER BY a.updated_at DESC
      LIMIT 20
    `);

    res.json({ queued, scheduled, paused });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch automation status' });
  }
});

router.get('/export/contacts.csv', verifyToken, async (req, res) => {
  try {
    const contacts = await all(`
      SELECT c.name, c.email, c.phone, c.company, c.product_interest, c.lead_score, 
             c.source, c.created_at, d.stage, d.pipeline, d.value
      FROM contacts c
      LEFT JOIN deals d ON c.id = d.contact_id AND d.created_at = (
        SELECT MAX(created_at) FROM deals WHERE contact_id = c.id
      )
      ORDER BY c.created_at DESC
    `);

    const csv = [
      'Name,Email,Phone,Company,Product Interest,Lead Score,Source,Created,Deal Stage,Pipeline,Deal Value',
      ...contacts.map(c => 
        `"${c.name || ''}","${c.email || ''}","${c.phone || ''}","${c.company || ''}","${c.product_interest || ''}",${c.lead_score || 0},"${c.source || ''}","${c.created_at || ''}","${c.stage || ''}","${c.pipeline || ''}",${c.value || 0}`
      )
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=akssale_contacts.csv');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: 'Failed to export contacts' });
  }
});

export default router;