import { $ } from './dollarSelect.js'

const nav = $('.nav__menu')
const navMenuToggle = $('.nav__menu-toggle')
const mobile = window.matchMedia('(max-width: 1279px)')
let active = false

function updateMenu() {
  nav.classList.toggle('active', active)
  navMenuToggle.classList.toggle('active', active)
  navMenuToggle.setAttribute('aria-expanded', String(active))
  nav.inert = mobile.matches && !active
}

navMenuToggle.addEventListener('click', () => {
  active = !active
  updateMenu()
})
mobile.addEventListener('change', () => {
  active = false
  updateMenu()
})
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && active) {
    active = false
    updateMenu()
    navMenuToggle.focus()
  }
})
updateMenu()
