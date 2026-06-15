(function () {
  const token = getToken()
  if (!token) {
    window.location.href = '/pages/login.html'
  }

  // Показать имя сотрудника в шапке
  document.addEventListener('DOMContentLoaded', () => {
    try {
      const employee = getEmployee()
      const badge = document.getElementById('employee-badge')
      if (badge && employee) {
        badge.textContent = `${employee.full_name} · ID: ${employee.id}`
      }

      const logoutBtn = document.getElementById('logout-btn')
      if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
          clearAuth()
          window.location.href = '/pages/login.html'
        })
      }

      // Подсветить активный пункт меню
      const currentPage = window.location.pathname
      document.querySelectorAll('.nav-item').forEach(link => {
        if (currentPage.includes(link.getAttribute('href'))) {
          link.classList.add('active')
        }
      })
    } catch (e) {}
  })
})()
