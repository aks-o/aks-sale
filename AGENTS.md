# AKS Sales Automation System

A complete sales automation system for selling small tools, custom software, websites, and mining & crushing platforms.

## Dev Commands

- `node src/server.js` - Start the dev server (runs on port 3000 by default)
- `node --check src/server.js` - Syntax check
- `node --check src/database.js` - Syntax check

## Architecture

- **Frontend**: Static files in `public/` (HTML/CSS/JS)
- **Backend**: Express.js server in `src/`
- **Database**: SQLite at `data/aks_sale.db` (auto-created on first run)
- **Email**: Nodemailer with JSON transport (dev mode) or SMTP (production)

## Key Files

- `src/server.js` - Server entry, static serving, admin seeding, automation scheduler, unsubscribe routes
- `src/database.js` - SQLite schema and query helpers
- `src/emailService.js` - Email sending + HTML templates with unsubscribe links
- `src/automation/workflowEngine.js` - Lead capture, automation, reminders, dedup
- `src/routes/api.js` - REST API routes

## Testing

Start server:
```bash
node src/server.js
```

Test endpoints:
```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/config
```

Admin login:
```bash
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@aks-sale.com","password":"admin123"}'
```

## Default Admin

- Email: `admin@aks-sale.com`
- Password: `admin123`
- (Configured in `.env`, change before deployment)

## API Reference

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/leads` | Capture a new lead (handles dedup) |
| POST | `/api/login` | Admin login |
| GET | `/api/health` | Health check |
| GET | `/api/config` | Public configuration |
| GET | `/unsubscribe/:token` | Unsubscribe confirmation page |
| GET | `/unsubscribe/:token/confirm` | Confirm unsubscribe |

### Authenticated Endpoints (Bearer token)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard` | Dashboard stats, pipeline, recent leads, upcoming tasks |
| GET | `/api/contacts` | List all contacts |
| GET | `/api/contacts/:id` | Contact details (deals, tasks, emails, notes, automation) |
| GET | `/api/contacts/:id/timeline` | Unified activity feed |
| POST | `/api/contacts/:id/note` | Add a note to a contact |
| GET | `/api/contacts/:id/notes` | List notes for a contact |
| GET | `/api/deals` | List deals (supports pipeline, stage, search filters) |
| PUT | `/api/deals/:id/stage` | Update deal stage |
| GET | `/api/tasks` | List tasks (status filter: pending/completed) |
| PUT | `/api/tasks/:id/complete` | Complete a task |
| PUT | `/api/tasks/:id/reopen` | Reopen a completed task |
| GET | `/api/emails` | Email history |
| POST | `/api/emails/send` | Send manual email to a contact |
| POST | `/api/emails/:id/resend` | Resend a failed email |
| POST | `/api/automation/process` | Run automation cycle manually |
| GET | `/api/automation/status` | View queued, scheduled, and paused automations |
| PUT | `/api/contacts/:id/score` | Update lead score |
| GET | `/api/stats/pipeline` | Pipeline statistics |
| GET | `/api/stats/product-interest` | Product interest statistics |
| GET | `/api/export/contacts.csv` | Export all contacts as CSV |

## Automation Workflows

### Lead Capture → CRM (Workflow 1)
- New form submission creates a contact (with unsubscribe token) + deal
- Mining leads get a "Call within 24h" task auto-created
- Duplicate emails update the existing contact/deal (no duplicates)
- System note logged on re-submission

### Digital Products Email Sequence (Workflow 2)
- Day 0: Welcome email (sent immediately on form submission)
- Day 2: Follow-up with value + testimonial
- Day 4: Limited-time discount offer
- Day 7: Gentle check-in

### Mining Platform High-Touch (Workflow 3)
- Day 0: Technical brochure + specs + call booking link
- Day 0: Auto-create "Call within 24h" task for sales team
- Day 3: Follow-up reminder email

### Stale Lead Reminders (Workflow 4)
- Deals in "New Lead"/"New Inquiry" stage with 7+ days of no activity
- Automatically creates a follow-up task
- Runs hourly via the scheduler

### Automation Scheduling
- 5-minute interval: checks for due emails and sends them
- 1-hour interval: checks for stale leads and creates reminder tasks
- Supports backfill: if server was down, due emails fire on next cycle
- Lead scoring (opens/clicks) can auto-pause automation
