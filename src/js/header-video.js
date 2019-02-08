const videoContainer = $('.header-video')
const video = $('.header-video video')

videoContainer.addEventListener('click', playPause)

let playing = !video.paused

function playPause() {
  if (playing) {
    video.pause()
  } else {
    video.play()
  }
  playing = !playing
  setClass()
}

function setClass() {
  if (playing) {
    videoContainer.classList.add('playing')
  } else {
    videoContainer.classList.remove('playing')
  }
}

if (window.innerWidth >= 768)
  playPause()