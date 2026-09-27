const API_BASE = '/api';

const getAuthToken = () => localStorage.getItem('authToken');

const setAuthToken = (token) => {
  if (token) {
    localStorage.setItem('authToken', token);
  } else {
    localStorage.removeItem('authToken');
  }
};

async function apiCall(endpoint, options = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
}

const escapeHtml = (text) => {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

function getStageBadge(stage, pipeline) {
  const type = pipeline || 'digital';
  let bgColor = 'badge-pending';

  if (stage === 'Won') bgColor = 'badge-won';
  else if (stage === 'Lost') bgColor = 'badge-lost';
  else if (stage === 'New Lead' || stage === 'New Inquiry') bgColor = 'badge-pending';
  else if (stage.includes('Proposal') || stage === 'Proposal Sent') bgColor = '';
  else if (stage === 'Qualified' || stage === 'Needs Analysis') bgColor = 'badge-warm';

  return `<span class="badge ${bgColor}">${escapeHtml(stage)}</span>`;
}

function getPipelineBadge(pipeline) {
  return `<span class="badge ${pipeline === 'mining' ? 'badge-mining' : 'badge-digital'}">
    ${pipeline === 'mining' ? 'Mining' : 'Digital'}
  </span>`;
}

function getScoreBadge(score) {
  let bgColor = 'badge-pending';
  let label = 'Cold';
  if (score >= 20) { bgColor = 'badge-warm'; label = 'Hot'; }
  else if (score >= 10) { bgColor = ''; label = 'Warm'; }
  return `<span class="badge ${bgColor}">${score || 0} - ${label}</span>`;
}

function getTaskStatusBadge(status) {
  if (status === 'completed') return '<span class="badge badge-completed">Done</span>';
  return '<span class="badge badge-pending">Pending</span>';
}

function handleNavClick(page) {
  const pageMap = {
    dashboard: renderDashboard,
    contacts: renderContacts,
    deals: renderDeals,
    tasks: renderTasks,
    emails: renderEmails,
    reports: renderReports
  };
  if (pageMap[page]) {
    pageMap[page]();
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelector(`.nav-link[data-page="${page}"]`)?.classList.add('active');
    document.getElementById('pageTitle').textContent = page.charAt(0).toUpperCase() + page.slice(1);
  }
}

window.handleNavClick = handleNavClick;

function renderDashboardStatsCard(label, value, trend, clickPage) {
  return `<div class="stat-card" onclick="handleNavClick('${clickPage}')" style="cursor:pointer">
    <div class="stat-label">${label}</div>
    <div class="stat-value">${value}</div>
    ${trend ? `<div class="stat-trend">${trend}</div>` : ''}
  </div>`;
}

async function renderDashboard() {
  try {
    const data = await apiCall('/dashboard');
    const { stats, pipeline, recentLeads, upcomingTasks } = data;

    const totalRevenue = '$' + (stats.total_revenue ? stats.total_revenue.toLocaleString() : '0');

    let html = `
      <div class="stats-grid">
        ${renderDashboardStatsCard('Total Leads', stats.total_leads, '', 'contacts')}
        ${renderDashboardStatsCard('Total Deals', stats.total_deals, '', 'deals')}
        ${renderDashboardStatsCard('Hot Deals', stats.hot_deals, 'Needs attention', 'deals')}
        ${renderDashboardStatsCard('Pending Tasks', stats.pending_tasks, '', 'tasks')}
        ${renderDashboardStatsCard('Warm Leads', stats.warm_leads, '', 'contacts')}
        ${renderDashboardStatsCard('Total Revenue', totalRevenue, '', 'reports')}
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">Pipeline Overview</span>
        </div>
        <div class="pipeline-bar">
    `;

    const pipelineData = {};
    pipeline.forEach(p => {
      const key = `${p.pipeline}-${p.stage}`;
      pipelineData[key] = (pipelineData[key] || 0) + p.count;
    });

    const stages = ['New Lead', 'New Inquiry', 'Qualified', 'Needs Analysis', 'Proposal Sent', 'Negotiation', 'Won', 'Lost'];
    stages.forEach(stage => {
      const count = pipelineData[`digital-${stage}`] || pipelineData[`mining-${stage}`] || 0;
      if (count > 0) {
        html += `<div class="pipeline-stage stage-${stage.replace(/\s+/g, '')}">
          <div class="stage-name">${escapeHtml(stage)}</div>
          <div class="stage-count">${count}</div>
        </div>`;
      }
    });

    html += `</div></div>`;

    html += `
      <div class="card">
        <div class="card-header">
          <span class="card-title">Recent Leads</span>
          <a href="#" class="nav-link" data-page="contacts">View All</a>
        </div>
        <table class="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Interest</th>
              <th>Stage</th>
              <th>Score</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
    `;

    recentLeads.forEach(lead => {
      html += `
        <tr>
          <td>${escapeHtml(lead.name)}</td>
          <td>${escapeHtml(lead.email)}</td>
          <td>${escapeHtml(lead.product_interest)}</td>
          <td>${getStageBadge(lead.stage, lead.pipeline)} ${getPipelineBadge(lead.pipeline)}</td>
          <td>${getScoreBadge(lead.lead_score)}</td>
          <td>${formatDate(lead.created_at)}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">Upcoming Tasks</span>
          <a href="#" class="nav-link" data-page="tasks">View All</a>
        </div>
        <table class="table">
          <thead>
            <tr>
              <th>Task</th>
              <th>Contact</th>
              <th>Deal</th>
              <th>Due</th>
              <th>Pipeline</th>
            </tr>
          </thead>
          <tbody>
    `;

    upcomingTasks.forEach(task => {
      html += `
        <tr>
          <td>${escapeHtml(task.title)}</td>
          <td>${escapeHtml(task.contact_name)} (${escapeHtml(task.email)})</td>
          <td>${escapeHtml(task.deal_title)}</td>
          <td>${formatDate(task.due_date)}</td>
          <td>${getPipelineBadge(task.pipeline)}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('contentArea').innerHTML = html;

    document.querySelectorAll('[data-page="contacts"]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        renderContacts();
      });
    });
    document.querySelectorAll('[data-page="tasks"]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        renderTasks();
      });
    });
  } catch (error) {
    document.getElementById('contentArea').innerHTML =
      `<div class="card"><p style="color:red">Error: ${error.message}</p></div>`;
  }
}

async function renderContacts() {
  try {
    const contacts = await apiCall('/contacts');
    let html = `
      <div class="form-filters">
        <div class="filter-group">
          <label>Search</label>
          <input type="text" id="contactSearch" placeholder="Search contacts..." oninput="filterContacts()" />
        </div>
      </div>

      <div class="card">
        <table class="table" id="contactsTable">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Company</th>
              <th>Interest</th>
              <th>Deal Stage</th>
              <th>Score</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
    `;

    if (contacts.length === 0) {
      html += `<tr><td colspan="9">No contacts found</td></tr>`;
    }

    contacts.forEach(c => {
      html += `
        <tr data-contact="${c.id}" data-name="${escapeHtml(c.name || '')}" data-email="${escapeHtml(c.email || '')}" data-phone="${escapeHtml(c.phone || '')}" data-company="${escapeHtml(c.company || '')}">
          <td>${escapeHtml(c.name)}</td>
          <td>${escapeHtml(c.email)}</td>
          <td>${escapeHtml(c.phone || '-')}</td>
          <td>${escapeHtml(c.company || '-')}</td>
          <td>${escapeHtml(c.product_interest)}</td>
          <td>${getStageBadge(c.deal_stage, c.pipeline)} ${getPipelineBadge(c.pipeline)}</td>
          <td>${getScoreBadge(c.lead_score)}</td>
          <td class="table-actions">
            <button class="btn btn-sm btn-outline" onclick="viewContact(${c.id})">View</button>
          </td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('contentArea').innerHTML = html;
  } catch (error) {
    document.getElementById('contentArea').innerHTML =
      `<div class="card"><p style="color:red">Error: ${error.message}</p></div>`;
  }
}

function addNote(contactId) {
  const content = prompt('Enter a note for this contact:');
  if (content && content.trim()) {
    apiCall(`/contacts/${contactId}/note`, {
      method: 'POST',
      body: JSON.stringify({ content: content.trim(), type: 'manual' })
    }).then(() => {
      viewContact(contactId);
    }).catch(err => {
      alert('Failed to add note: ' + err.message);
    });
  }
}

function filterContacts() {
  const search = document.getElementById('contactSearch').value.toLowerCase();
  const rows = document.querySelectorAll('#contactsTable tbody tr');

  rows.forEach(row => {
    const name = row.dataset.name || '';
    const email = row.dataset.email || '';
    const phone = row.dataset.phone || '';
    const company = row.dataset.company || '';

    if (name.includes(search) || email.includes(search) || phone.includes(search) || company.includes(search)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

async function viewContact(id) {
  try {
    const data = await apiCall(`/contacts/${id}`);
    const { contact, deals, tasks, emails, automation } = data;

    let html = `
      <button class="btn btn-sm btn-outline" onclick="renderContacts()" style="margin-bottom:16px">← Back to Contacts</button>
      <div class="card">
        <div class="card-header">
          <span class="card-title">Contact: ${escapeHtml(contact.name)}</span>
        </div>
        <table class="table">
          <tr><th>Name</th><td>${escapeHtml(contact.name)}</td></tr>
          <tr><th>Email</th><td>${escapeHtml(contact.email)}</td></tr>
          <tr><th>Phone</th><td>${escapeHtml(contact.phone || '-')}</td></tr>
          <tr><th>Company</th><td>${escapeHtml(contact.company || '-')}</td></tr>
          <tr><th>Product Interest</th><td>${escapeHtml(contact.product_interest)}</td></tr>
          <tr><th>Lead Score</th><td>${getScoreBadge(contact.lead_score)}</td></tr>
          <tr><th>Source</th><td>${escapeHtml(contact.source || '-')}</td></tr>
          <tr><th>Created</th><td>${formatDate(contact.created_at)}</td></tr>
        </table>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-title">Deals</span></div>
        <table class="table">
          <thead><tr><th>Title</th><th>Stage</th><th>Pipeline</th><th>Value</th><th>Actions</th></tr></thead>
          <tbody>
    `;

    if (deals.length === 0) {
      html += `<tr><td colspan="5">No deals</td></tr>`;
    }

    deals.forEach(deal => {
      html += `
        <tr>
          <td>${escapeHtml(deal.title)}</td>
          <td>
            <select class="deal-stages-select" onchange="updateDealStage(${deal.id}, this.value)">
              ${getStageOptions(deal.stage, deal.pipeline)}
            </select>
          </td>
          <td>${getPipelineBadge(deal.pipeline)}</td>
          <td>$${deal.value.toLocaleString()}</td>
          <td><button class="btn btn-sm btn-outline" onclick="viewDeal(${deal.id})">Details</button></td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-title">Tasks</span></div>
        <table class="table">
          <thead><tr><th>Task</th><th>Assigned To</th><th>Due</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
    `;

    tasks.forEach(task => {
      html += `
        <tr>
          <td>${escapeHtml(task.title)}</td>
          <td>${escapeHtml(task.assigned_to || '-')}</td>
          <td>${formatDate(task.due_date)}</td>
          <td>${getTaskStatusBadge(task.status)}</td>
          <td>
            ${task.status === 'pending' ? `<button class="btn btn-sm btn-outline" onclick="completeTask(${task.id})">Complete</button>` : ''}
          </td>
        </tr>
      `;
    });

    if (tasks.length === 0) {
      html += `<tr><td colspan="5">No tasks</td></tr>`;
    }

    html += `
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-title">Email History</span></div>
        <table class="table">
          <thead><tr><th>Type</th><th>Subject</th><th>Date</th><th>Status</th></tr></thead>
          <tbody>
    `;

    if (emails.length === 0) {
      html += `<tr><td colspan="4">No emails sent</td></tr>`;
    }

    emails.forEach(e => {
      html += `
        <tr>
          <td><span class="badge badge-digital">${escapeHtml(e.email_type)}</span></td>
          <td>${escapeHtml(e.subject)}</td>
          <td>${formatDate(e.sent_at)}</td>
          <td>${getTaskStatusBadge(e.status)}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;

    if (automation) {
      html += `
        <div class="card">
          <div class="card-header"><span class="card-title">Automation Status</span></div>
          <table class="table">
            <tr><th>Sequence</th><td>${escapeHtml(automation.sequence_type)}</td></tr>
            <tr><th>Current Step</th><td>${automation.current_step + 1} of ${automation.sequence_length}</td></tr>
            <tr><th>Next Email</th><td>${formatDate(automation.next_email_at)}</td></tr>
            <tr><th>Status</th><td>${automation.paused ? 'Paused' : 'Active'}</td></tr>
          </table>
        </div>
      `;
    }

    html += `
      <div class="card">
        <div class="card-header">
          <span class="card-title">Notes</span>
          <button class="btn btn-sm btn-primary" onclick="addNote(${contact.id})">Add Note</button>
        </div>
        <table class="table" id="notesTable">
          <thead>
            <tr><th>Date</th><th>Type</th><th>Note</th><th>Added By</th></tr>
          </thead>
          <tbody>
    `;

    if (data.notes && data.notes.length > 0) {
      data.notes.forEach(note => {
        html += `
          <tr>
            <td>${formatDate(note.created_at)}</td>
            <td><span class="badge badge-digital">${escapeHtml(note.type || 'manual')}</span></td>
            <td>${escapeHtml(note.content)}</td>
            <td>${escapeHtml(note.user_name || 'System')}</td>
          </tr>
        `;
      });
    } else {
      html += `<tr><td colspan="4">No notes yet</td></tr>`;
    }

    html += `
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('contentArea').innerHTML = html;
  } catch (error) {
    document.getElementById('contentArea').innerHTML =
      `<div class="card"><p style="color:red">Error: ${error.message}</p></div>`;
  }
}

function getStageOptions(currentStage, pipeline) {
  const stages = pipeline === 'mining'
    ? ['New Inquiry', 'Needs Analysis', 'Proposal Sent', 'Negotiation', 'Won', 'Lost']
    : ['New Lead', 'Qualified', 'Proposal Sent', 'Negotiation', 'Won', 'Lost'];

  return stages.map(s =>
    `<option value="${escapeHtml(s)}" ${s === currentStage ? 'selected' : ''}>${escapeHtml(s)}</option>`
  ).join('');
}

async function updateDealStage(dealId, stage) {
  try {
    await apiCall(`/deals/${dealId}/stage`, {
      method: 'PUT',
      body: JSON.stringify({ stage })
    });
  } catch (error) {
    console.error('Failed to update stage:', error);
  }
}

async function renderDeals() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const pipeline = urlParams.get('pipeline') || '';
    const stage = urlParams.get('stage') || '';
    const search = urlParams.get('search') || '';

    let url = '/deals';
    const params = new URLSearchParams();
    if (pipeline) params.set('pipeline', pipeline);
    if (stage) params.set('stage', stage);
    if (search) params.set('search', search);
    if (params.toString()) url += '?' + params.toString();

    const deals = await apiCall(url);

    let html = `
      <div class="form-filters">
        <div class="filter-group">
          <label>Pipeline</label>
          <select onchange="filterDeals('pipeline', this.value)">
            <option value="">All</option>
            <option value="digital" ${pipeline === 'digital' ? 'selected' : ''}>Digital</option>
            <option value="mining" ${pipeline === 'mining' ? 'selected' : ''}>Mining</option>
          </select>
        </div>
        <div class="filter-group">
          <label>Stage</label>
          <select onchange="filterDeals('stage', this.value)">
            <option value="">All</option>
            <option value="New Lead" ${stage === 'New Lead' ? 'selected' : ''}>New Lead</option>
            <option value="Qualified" ${stage === 'Qualified' ? 'selected' : ''}>Qualified</option>
            <option value="Proposal Sent" ${stage === 'Proposal Sent' ? 'selected' : ''}>Proposal Sent</option>
            <option value="Negotiation" ${stage === 'Negotiation' ? 'selected' : ''}>Negotiation</option>
            <option value="Won" ${stage === 'Won' ? 'selected' : ''}>Won</option>
            <option value="Lost" ${stage === 'Lost' ? 'selected' : ''}>Lost</option>
          </select>
        </div>
        <div class="filter-group">
          <label>Search</label>
          <input type="text" id="dealSearch" placeholder="Search deals..." value="${search}" oninput="filterDeals('search', this.value)" />
        </div>
      </div>

      <div class="card">
        <table class="table">
          <thead>
            <tr>
              <th>Deal</th>
              <th>Contact</th>
              <th>Pipeline</th>
              <th>Stage</th>
              <th>Value</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
    `;

    if (deals.length === 0) {
      html += `<tr><td colspan="7">No deals found</td></tr>`;
    }

    deals.forEach(deal => {
      html += `
        <tr>
          <td><strong>${escapeHtml(deal.title)}</strong></td>
          <td>${escapeHtml(deal.name)} (${escapeHtml(deal.email)})</td>
          <td>${getPipelineBadge(deal.pipeline)}</td>
          <td>
            <select class="deal-stages-select" onchange="updateDealStage(${deal.id}, this.value)">
              ${getStageOptions(deal.stage, deal.pipeline)}
            </select>
          </td>
          <td>$${deal.value?.toLocaleString() || 0}</td>
          <td>${formatDate(deal.created_at)}</td>
          <td>
            <button class="btn btn-sm btn-outline" onclick="viewContact(${deal.contact_id})">Contact</button>
          </td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('contentArea').innerHTML = html;
  } catch (error) {
    document.getElementById('contentArea').innerHTML =
      `<div class="card"><p style="color:red">Error: ${error.message}</p></div>`;
  }
}

function filterDeals(field, value) {
  const urlParams = new URLSearchParams(window.location.search);
  urlParams.set(field, value);
  window.location.search = urlParams.toString();
}

async function renderTasks() {
  try {
    const tasks = await apiCall('/tasks?status=pending');
    const completedTasks = await apiCall('/tasks?status=completed');

    let html = `
      <div class="card">
        <div class="card-header"><span class="card-title">Pending Tasks (${tasks.length})</span></div>
        <table class="table">
          <thead>
            <tr>
              <th>Task</th>
              <th>Description</th>
              <th>Contact</th>
              <th>Deal</th>
              <th>Due Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
    `;

    if (tasks.length === 0) {
      html += `<tr><td colspan="6">No pending tasks</td></tr>`;
    }

    tasks.forEach(task => {
      html += `
        <tr>
          <td><strong>${escapeHtml(task.title)}</strong></td>
          <td>${escapeHtml(task.description || '')}</td>
          <td>${escapeHtml(task.contact_name)} (${escapeHtml(task.email)})</td>
          <td>${escapeHtml(task.deal_title || '')}</td>
          <td>${formatDate(task.due_date)}</td>
          <td>
            <button class="btn btn-sm btn-outline" onclick="completeTask(${task.id})">Complete</button>
          </td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-title">Completed Tasks (${completedTasks.length})</span></div>
        <table class="table">
          <thead><tr><th>Task</th><th>Contact</th><th>Completed</th></tr></thead>
          <tbody>
    `;

    completedTasks.slice(0, 20).forEach(task => {
      html += `
        <tr>
          <td>${escapeHtml(task.title)}</td>
          <td>${escapeHtml(task.contact_name)} (${escapeHtml(task.email)})</td>
          <td>${formatDate(task.completed_at)}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('contentArea').innerHTML = html;
  } catch (error) {
    document.getElementById('contentArea').innerHTML =
      `<div class="card"><p style="color:red">Error: ${error.message}</p></div>`;
  }
}

async function completeTask(taskId) {
  try {
    await apiCall(`/tasks/${taskId}/complete`, { method: 'PUT' });
    renderTasks();
  } catch (error) {
    console.error('Failed to complete task:', error);
  }
}

async function renderEmails() {
  try {
    const emails = await apiCall('/emails?limit=100');

    let html = `
      <div class="card">
        <div class="card-header"><span class="card-title">Email History (${emails.length})</span></div>
        <table class="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Contact</th>
              <th>Type</th>
              <th>Subject</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
    `;

    if (emails.length === 0) {
      html += `<tr><td colspan="5">No emails sent yet</td></tr>`;
    }

    emails.forEach(e => {
      html += `
        <tr>
          <td>${formatDate(e.sent_at)}</td>
          <td>${escapeHtml(e.contact_name || '-')}</td>
          <td><span class="badge badge-digital">${escapeHtml(e.email_type)}</span></td>
          <td>${escapeHtml(e.subject)}</td>
          <td>${getTaskStatusBadge(e.status)}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('contentArea').innerHTML = html;
  } catch (error) {
    document.getElementById('contentArea').innerHTML =
      `<div class="card"><p style="color:red">Error: ${error.message}</p></div>`;
  }
}

async function renderReports() {
  try {
    const pipelineStats = await apiCall('/stats/pipeline');
    const interestStats = await apiCall('/stats/product-interest');

    let html = `
      <div class="card">
        <div class="card-header"><span class="card-title">Pipeline Breakdown</span></div>
        <table class="table">
          <thead>
            <tr><th>Pipeline</th><th>Product</th><th>Stage</th><th>Deals</th><th>Avg Value</th></tr>
          </thead>
          <tbody>
    `;

    pipelineStats.forEach(s => {
      html += `
        <tr>
          <td>${getPipelineBadge(s.pipeline)}</td>
          <td>${escapeHtml(s.product_type)}</td>
          <td>${escapeHtml(s.stage)}</td>
          <td>${s.deal_count}</td>
          <td>$${s.avg_value?.toLocaleString() || 0}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-title">Product Interest</span></div>
        <table class="table">
          <thead>
            <tr><th>Product</th><th>Leads</th><th>Won Deals</th><th>Avg Score</th></tr>
          </thead>
          <tbody>
    `;

    interestStats.forEach(s => {
      html += `
        <tr>
          <td>${escapeHtml(s.product_interest)}</td>
          <td>${s.lead_count}</td>
          <td>${s.won_deals}</td>
          <td>${s.avg_score?.toFixed(1) || 0}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('contentArea').innerHTML = html;
  } catch (error) {
    document.getElementById('contentArea').innerHTML =
      `<div class="card"><p style="color:red">Error: ${error.message}</p></div>`;
  }
}

function setupNavigation() {
  const navLinks = document.querySelectorAll('.nav-link[data-page]');
  const menuToggle = document.getElementById('menuToggle');

  const pageMap = {
    dashboard: renderDashboard,
    contacts: renderContacts,
    deals: renderDeals,
    tasks: renderTasks,
    emails: renderEmails,
    reports: renderReports
  };

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const page = link.getAttribute('data-page');
      if (pageMap[page]) {
        pageMap[page]();
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        document.getElementById('pageTitle').textContent =
          page.charAt(0).toUpperCase() + page.slice(1);
      }
    });
  });

  if (menuToggle) {
    menuToggle.addEventListener('click', () => {
      document.querySelector('.sidebar').classList.toggle('open');
    });
  }

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      setAuthToken(null);
      window.location.href = '/admin/login.html';
    });
  }
}

export {
  apiCall, getAuthToken, setAuthToken, escapeHtml, formatDate,
  getStageBadge, getPipelineBadge, getScoreBadge, getTaskStatusBadge,
  getStageOptions, updateDealStage, filterDeals, completeTask,
  renderDashboard, renderContacts, renderDeals, renderTasks, renderEmails, renderReports,
  filterContacts, viewContact, addNote, setupNavigation, handleNavClick, renderDashboardStatsCard
};