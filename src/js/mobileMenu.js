const nav = $(".nav__menu")
const navMenuToggle = $(".nav__menu-toggle")

let active = false

navMenuToggle.addEventListener("click", toggleMenu)

function toggleMenu() {
  if (active) {
    nav.classList.remove("active")
    navMenuToggle.classList.remove("active")
    nav.setAttribute("aria-expanded", "false")
  } else {
    nav.classList.add("active")
    navMenuToggle.classList.add("active")
    nav.setAttribute("aria-expanded", "true")
  }
  active = !active
}
