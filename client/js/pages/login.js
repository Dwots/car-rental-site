document.addEventListener('DOMContentLoaded', () => {
  // Если уже залогинен — редирект
  if (getToken()) {
    window.location.href = 'new-order.html'
    return
  }

  const form = document.getElementById('login-form')
  const errorMsg = document.getElementById('error-msg')
  const submitBtn = document.getElementById('submit-btn')

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const login = document.getElementById('login-input').value.trim()
    const password = document.getElementById('password-input').value.trim()

    if (!login || !password) {
      showError('Введите логин и пароль')
      return
    }

    submitBtn.disabled = true
    submitBtn.innerHTML = '<span class="spinner"></span> Вход...'
    errorMsg.classList.add('hidden')

    try {
      const data = await loginRequest(login, password)
      saveAuth(data.token, data.employee)
      window.location.href = 'new-order.html'
    } catch (err) {
      showError(err.message || 'Ошибка входа')
      submitBtn.disabled = false
      submitBtn.textContent = 'Войти'
    }
  })

  function showError(msg) {
    errorMsg.textContent = msg
    errorMsg.classList.remove('hidden')
  }
})
