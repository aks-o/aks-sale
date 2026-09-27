import { apiCall, setAuthToken } from './admin.js';

const initLogin = () => {
  const form = document.getElementById('loginForm');
  const errorEl = document.getElementById('loginError');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const email = formData.get('email');
    const password = formData.get('password');

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span>Signing in...</span>';
    submitBtn.classList.add('btn-loading');

    try {
      const result = await apiCall('/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      setAuthToken(result.token);
      window.location.href = '/admin/index.html';
    } catch (error) {
      errorEl.textContent = error.message || 'Login failed';
      errorEl.classList.remove('hidden');
    } finally {
      submitBtn.innerHTML = originalText;
      submitBtn.classList.remove('btn-loading');
    }
  });

  const token = localStorage.getItem('authToken');
  if (token) {
    window.location.href = '/admin/index.html';
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const pages = window.location.pathname.split('/').pop();

  if (pages === 'login.html') {
    initLogin();
  } else if (pages === 'index.html' || window.location.pathname === '/admin/') {
    const token = localStorage.getItem('authToken');
    if (!token) {
      window.location.href = '/admin/login.html';
      return;
    }
    import('./admin.js').then(module => {
      module.setupNavigation();
      module.renderDashboard();
    });
  }
});

export { initLogin };
