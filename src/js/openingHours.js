const light = $('.nav__right--contact--opening-hours--light')
const label = $('.nav__right--contact--opening-hours--light span')

updateLight()

setTimeout(updateLight, 5000)

function updateLight() {
  const date = new Date()
  const day = date.getDay()
  const hour = date.getHours()
  const minutes = date.getMinutes()
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
  light.classList.add(status)
  label.textContent = status.replace('-', ' ')
} 