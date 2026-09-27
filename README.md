# AKS Sales Automation System

A complete sales automation system for selling **small tools**, **software**, **websites**, and **mining & crushing platforms**. Features lead capture, CRM pipeline management, automated email sequences, and task reminders.

## Features

### Lead Capture
- Responsive landing page with product interest dropdown
- Booking page for scheduling consultations
- Form validation and success confirmations
- Email deduplication (repeat submissions update existing contact)

### CRM & Pipeline
- Contact management with lead scoring
- Deal pipelines for digital products and mining platforms
- Task management with due dates and assignments
- Email history tracking with status
- Notes for manual annotations
- Unified timeline view per contact

### Automation
- **Workflow 1**: Lead capture → contact + deal creation in CRM
- **Workflow 2**: Auto email sequences for Tools / Software / Websites (5–7 emails)
- **Workflow 3**: High-touch follow-up for Mining & Crushing Platform (immediate technical email + task + reminders)
- **Workflow 4**: Automated reminders & lead scoring

- 5-minute automation interval for email sequences
- 1-hour interval for stale lead reminders
- Backfill support: missed emails fire on next cycle
- Lead scoring auto-pauses automation for engaged leads
- Unsubscribe links on every email (CAN-SPAM compliant)

### Admin Dashboard
- Login authentication with bcrypt password hashing
- Dashboard with key metrics and pipeline overview
- Pipeline stage updates with single-select dropdowns
- Contact detail views with full history and timeline
- Deal management with search/filter
- Task list with completion tracking
- Email history browser with resend capability
- CSV export of all contacts
- Reporting with product interest breakdown

### Tech Stack
- **Backend**: Node.js + Express
- **Database**: SQLite (no external server required)
- **Frontend**: Vanilla HTML/CSS/JS
- **Email**: Nodemailer (JSON transport for dev, SMTP for production)
- **Auth**: bcrypt password hashing, token-based sessions

## Quick Start

### Prerequisites
- Node.js 20+
- npm

### Installation

```bash
npm install
cp .env.example .env
# Edit .env with your SMTP credentials and admin password
```

### Run

```bash
npm run dev
```

- Landing page: `http://localhost:3000`
- Products catalog: `http://localhost:3000/products.html`
- Booking page: `http://localhost:3000/booking.html`
- Admin login: `http://localhost:3000/admin/login.html`

### Default Admin

```
Email: admin@aks-sale.com
Password: admin123
```

## Product Catalog

### Small Tools ($199–$899)
| Product | Description | Price |
|---------|-------------|-------|
| Bulk Invoice Generator | Excel/CSV to PDF, GST-ready | $199 |
| WhatsApp Order Bot | Auto-replies + order capture | $299 |
| PDF Merger + Watermarker Pro | Merge, split, stamp | $149 |
| Inventory Tracker Lite | SKU + low-stock alerts | $349 |
| Lead Scraper | Google Maps/LinkedIn extraction | $399 |

### Custom Software ($999–$9,999)
| Product | Description | Price |
|---------|-------------|-------|
| CRM Lite (Custom-Branded) | Leads, deals, WhatsApp sync | $1,999 |
| Inventory + Billing ERP | Stock, invoices, GST | $2,499 |
| School/Coaching Management | Students, fees, attendance | $1,799 |
| Clinic/Hospital Management | Appointments, EMR, pharmacy | $2,999 |
| Custom Desktop POS | Offline POS, barcode printing | $999 |
| Field Service App | GPS, photo proof, invoicing | $3,499 |
| HRMS | Hiring, payroll, leave | $4,999 |

### Websites ($399–$4,999)
| Product | Description | Price |
|---------|-------------|-------|
| Lead-Gen Landing Page | 1 high-converting page | $399 |
| Starter Business Site | 3 pages, mobile, contact form | $499 |
| Restaurant Site + Menu | Menu, QR order, booking | $999 |
| E-Commerce Store (Lite) | Cart, COD, UPI, WhatsApp | $1,499 |
| Professional Service Site | 6 pages, blog, SEO | $899 |
| Full E-Commerce Store | Inventory, payment gateway | $2,499 |
| Real Estate Site | Listings, filters, lead capture | $1,799 |

### Mining & Crushing Platform ($50,000+)
| Package | Target | Price |
|---------|--------|-------|
| Starter (50 TPH) | Small quarry | $50,000 |
| Growth (150 TPH) | Mid-size operator | $85,000 |
| Enterprise (500 TPH) | Large multi-site | $150,000+ |

## Automation Workflows

### Digital Products Email Sequence
1. **Day 0** — Welcome email with solution overview
2. **Day 2** — Value demonstration (use case/testimonial)
3. **Day 4** — Limited-time offer (15% discount)
4. **Day 7** — Check-in email

### Mining Platform High-Touch
1. **Day 0** — Technical brochure + capacity specs + call booking link
2. **Day 0** — Auto-create "Call within 24h" task for sales team
3. **Day 3** — Reminder email following up on review

### Lead Scoring
- Email open: +5 points
- Link click: +10 points
- Warm threshold (>=10): auto-pause automation for personal follow-up

### Stale Lead Management
- Deals in "New Lead" / "New Inquiry" stage for 7+ days without activity generate automatic follow-up tasks.

## Email Deliverability

To ensure emails reach the inbox:

1. **Set up SPF, DKIM, and DMARC** DNS records on your sending domain
2. **Use a dedicated provider** (Brevo free 300/day, SendGrid, Amazon SES) — don't use Gmail
3. **Warm up** the sender address gradually (5–10 emails/day first week)
4. Every email includes an **unsubscribe link** — CAN-SPAM/GDPR compliant

## Deployment

For production, use `pm2` to keep the server running:

```bash
npm install -g pm2
pm2 start src/server.js --name "aks-sale"
pm2 save
pm2 startup
```

Set up **UptimeRobot** (free) to ping `GET /api/health` every 5 minutes — wakes the server and alerts you if it dies.

## License

MIT