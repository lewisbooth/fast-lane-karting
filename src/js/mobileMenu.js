const nav = $("nav")
const navMenuToggle = $(".nav__menu-toggle")

navMenuToggle.addEventListener("click", toggleMenu)

function toggleMenu() {
  if (nav.classList.contains("active")) {
    nav.classList.remove("active")
    nav.setAttribute("aria-expanded", "false")
  } else {
    nav.classList.add("active")
    nav.setAttribute("aria-expanded", "true")
  }
}
