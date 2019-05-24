const light = $('.nav__right--contact--opening-hours--light')
const label = $('.nav__right--contact--opening-hours--light span')

const date = new Date()
const day = date.getDay()
const hour = date.getHours()
const minutes = date.getMinutes()

updateLight()
setTimeout(updateLight, 3600)

function updateLight() {
  if (hour >= 10 && hour < 22)
    changeStatus('open-now')
  else if (day == 6 && hour >= 9 && hour < 22)
    changeStatus('open-now')
  else if (hour == 22 && minutes < 30)
    changeStatus('closing-soon')
  else
    changeStatus('closed')
}

function changeStatus(status) {
  console.log(status)
  light.classList.add(status)
  label.textContent = status.replace('-', ' ')
}