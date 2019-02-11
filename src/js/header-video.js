const videoContainer = $('.header-video')
const video = $('.header-video video')

let playing = false

video.oncanplay = () => {
  if (window.innerWidth >= 768)
    video.play()
}

videoContainer.addEventListener('click', playPause)

function playPause() {
  if (playing) {
    video.pause()
    videoContainer.classList.remove('playing')
  } else {
    video.play()
    videoContainer.classList.add('playing')
  }
  playing = !playing
}