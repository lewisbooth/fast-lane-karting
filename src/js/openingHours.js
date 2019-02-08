const light = $('.nav__right--contact--opening-hours--light')
const label = $('.nav__right--contact--opening-hours--light span')
const hour = new Date().getHours()
const minutes = new Date().getMinutes()

updateLight()
setTimeout(updateLight, 3600)

function updateLight() {
  if (hour >= 10 && hour < 22)
    changeStatus('open-now')
  else if (hour == 22 && minutes < 30)
    changeStatus('closing-soon')
  else
    changeStatus('closed')
}

function changeStatus(status) {
  light.classList.add(status)
  label.textContent = status.replace('-', ' ')
}