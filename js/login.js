/* Login Page Functionality & Password Toggle */

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const errorEl = document.getElementById('error');
  const submitBtn = document.getElementById('login-btn');
  const passwordInput = document.getElementById('password');
  const togglePasswordBtn = document.getElementById('toggle-password');
  const toggleIcon = document.getElementById('toggle-icon');

  // Password Visibility Toggle Logic
  if (togglePasswordBtn && passwordInput && toggleIcon) {
    togglePasswordBtn.addEventListener('click', () => {
      const isPassword = passwordInput.getAttribute('type') === 'password';
      
      // Toggle type attribute
      passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
      
      // Toggle eye icon classes
      if (isPassword) {
        toggleIcon.classList.remove('fa-eye');
        toggleIcon.classList.add('fa-eye-slash');
      } else {
        toggleIcon.classList.remove('fa-eye-slash');
        toggleIcon.classList.add('fa-eye');
      }
    });
  }

  // Form Submission Logic
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Reset error state
      errorEl.style.display = 'none';

      const username = document.getElementById('username').value.trim();
      const password = passwordInput.value.trim();

      // Safely retrieve the Supabase client initialized in config.js
      const client = window.dbClient || (typeof dbClient !== 'undefined' ? dbClient : null);

      if (!client) {
        alert('Database client not initialized. Check js/config.js.');
        return;
      }

      // Indicate loading state
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span>Verifying...</span> <i class="fa-solid fa-spinner fa-spin"></i>`;

      try {
        const { data, error } = await client
          .from('admin_auth')
          .select('*')
          .eq('username', username)
          .eq('password', password)
          .maybeSingle();

        if (error || !data) {
          if (error) console.error('Authentication query failed:', error);
          errorEl.style.display = 'flex';
        } else {
          sessionStorage.setItem('rl_auth', 'true');
          window.location.href = 'index.html';
        }
      } catch (err) {
        console.error('Unexpected login error:', err);
        errorEl.style.display = 'flex';
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>Sign In</span> <i class="fa-solid fa-arrow-right"></i>`;
      }
    });
  }
});