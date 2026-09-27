const API_BASE = '/api';

async function apiCall(endpoint, options = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('leadForm');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const formData = new FormData(form);
      const data = {
        name: formData.get('name'),
        email: formData.get('email'),
        phone: formData.get('phone') || undefined,
        company: formData.get('company') || undefined,
        productInterest: formData.get('productInterest'),
        description: formData.get('description') || undefined
      };

      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      submitBtn.innerHTML = '<span>Submitting...</span>';
      submitBtn.classList.add('btn-loading');

      try {
        const result = await apiCall('/leads', {
          method: 'POST',
          body: JSON.stringify(data)
        });

        if (result.contactId) {
          form.reset();
          showSuccessModal();
        }
      } catch (error) {
        console.error('Form submission error:', error);
        showError('Failed to submit form. Please try again.');
      } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.classList.remove('btn-loading');
      }
    });
  }

  document.querySelectorAll('.nav a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        const offsetTop = target.offsetTop - 80;
        window.scrollTo({
          top: offsetTop,
          behavior: 'smooth'
        });
      }
    });
  });
});

function showSuccessModal() {
  const modal = document.getElementById('formSuccess');
  if (modal) {
    modal.classList.remove('hidden');
  }
}

function closeModal() {
  const modal = document.getElementById('formSuccess');
  if (modal) {
    modal.classList.add('hidden');
  }
}

function showError(message) {
  const existing = document.querySelector('.form-error');
  if (existing) {
    existing.remove();
  }

  const errorDiv = document.createElement('div');
  errorDiv.className = 'form-error';
  errorDiv.style.cssText = 'background: #fee2e2; color: #991b2b; padding: 12px; border-radius: 8px; margin: 16px 0; text-align: center;';
  errorDiv.textContent = message;

  const form = document.getElementById('leadForm');
  form.parentNode.insertBefore(errorDiv, form.nextSibling);

  setTimeout(() => {
    errorDiv.remove();
  }, 5000);
}

window.closeModal = closeModal;

window.selectProduct = function(productValue) {
  const form = document.getElementById('leadForm');
  if (!form) return;
  const select = document.getElementById('productInterest');
  if (select) {
    select.value = productValue;
  }
  const formSection = document.getElementById('contact');
  if (formSection) {
    const offsetTop = formSection.offsetTop - 80;
    window.scrollTo({ top: offsetTop, behavior: 'smooth' });
  }
};

export { apiCall, showSuccessModal, showError };
