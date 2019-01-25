const light = $('.nav__right--contact--opening-hours--light')

// Change color of the light based on opening hours
function setLightColor() {
  const hour = new Date().getHours()
  const minutes = new Date().getMinutes()
  light.classList.remove('closed')
  light.classList.remove('closing-soon')
  if (hour < 10)
    light.classList.add('closed')
  if (hour > 22 || (hour == 22 && minutes > 30))
    light.classList.add('closed')
  if (hour == 21 && minutes >= 30)
    light.classList.add('closing-soon')
  if (hour == 22 && minutes <= 30)
    light.classList.add('closing-soon')
}

// Update light colour every minute
setInterval(setLightColor, 60000)

setLightColor()