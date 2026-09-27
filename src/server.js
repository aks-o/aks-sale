import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { initDb, run, get, all } from './database.js';
import apiRoutes from './routes/api.js';
import { processAutomationQueue, processDueReminders } from './automation/workflowEngine.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : true,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(express.static(path.join(__dirname, '../public')));

app.use('/api', apiRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/config', (req, res) => {
  res.json({
    siteName: 'AKS Sales',
    products: ['Tools', 'Software', 'Websites', 'Mining & crushing platform'],
    siteUrl: process.env.SITE_URL || 'http://localhost:3000'
  });
});

app.get('/unsubscribe/:token', async (req, res) => {
  try {
    const contact = await get('SELECT id, email, name FROM contacts WHERE unsubscribe_token = ?', [req.params.token]);
    if (!contact) {
      return res.status(404).send('<h1>Invalid unsubscribe link</h1><p><a href="/">Return to homepage</a></p>');
    }

    const SITE_URL = process.env.SITE_URL || 'http://localhost:3000';
    res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; max-width: 500px; margin: 40px auto; padding: 20px; text-align: center;">
          <h1>Unsubscribe Confirmation</h1>
          <p>You are about to unsubscribe <strong>${escapeHtml(contact.email)}</strong> from all AKS Sales emails.</p>
          <button onclick="doUnsubscribe()" style="background:#dc2626;color:white;padding:12px 24px;border:none;border-radius:8px;cursor:pointer;">Confirm Unsubscribe</button>
          <a href="${SITE_URL}" style="display:inline-block;margin-left:12px;color:#6b7280;text-decoration:none;">Cancel</a>
          <script>
            async function doUnsubscribe() {
              await fetch('/unsubscribe/${contact.unsubscribe_token}/confirm');
              alert('You have been unsubscribed.');
              window.location.href = '${SITE_URL}';
            }
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send('<h1>Error processing unsubscribe</h1>');
  }
});

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}

app.get('/unsubscribe/:token/confirm', async (req, res) => {
  try {
    const contact = await get('SELECT id FROM contacts WHERE unsubscribe_token = ?', [req.params.token]);
    if (!contact) {
      return res.status(404).send('<h1>Invalid unsubscribe link</h1>');
    }

    await run('UPDATE contacts SET unsubscribe_token = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [contact.id]);
    await run('UPDATE automation_state SET paused = 1, updated_at = CURRENT_TIMESTAMP WHERE contact_id = ?', [contact.id]);

    res.send('<h1>You have been unsubscribed successfully. You will no longer receive emails from AKS Sales.</h1><p><a href="/">Return to homepage</a></p>');
  } catch (error) {
    res.status(500).send('<h1>Error processing unsubscribe</h1>');
  }
});

app.use((req, res) => {
  if (req.accepts('html')) {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

const seedAdmin = async () => {
  try {
    const existing = await get('SELECT id FROM users WHERE email = ?', [process.env.ADMIN_EMAIL]);
    if (!existing) {
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', saltRounds);
      await run(
        'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
        ['Admin User', process.env.ADMIN_EMAIL, passwordHash, 'admin']
      );
      console.log('Default admin user created');
    }
  } catch (error) {
    console.error('Admin seeding error:', error.message);
  }
};

const startAutomationInterval = () => {
  const interval = 5 * 60 * 1000;

  setInterval(async () => {
    try {
      const emailResults = await processAutomationQueue();
      if (emailResults.length > 0) {
        console.log(`Automation: processed ${emailResults.length} emails`);
      }
    } catch (error) {
      console.error('Automation interval error:', error.message);
    }
  }, interval);

  setInterval(async () => {
    try {
      const reminderResults = await processDueReminders();
      if (reminderResults.length > 0) {
        console.log(`Reminders: created ${reminderResults.length} tasks`);
      }
    } catch (error) {
      console.error('Reminder interval error:', error.message);
    }
  }, 60 * 60 * 1000);

  console.log('Automation scheduler started (runs every 5 minutes)');
};

initDb()
  .then(async () => {
    console.log('Database initialized');
    await seedAdmin();
    app.listen(PORT, () => {
      console.log(`AKS SALE server running on http://localhost:${PORT}`);
      startAutomationInterval();
    });
  })
  .catch((error) => {
    console.error('Database init failed:', error);
    process.exit(1);
  });

export default app;