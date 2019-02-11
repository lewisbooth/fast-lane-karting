const videoContainer = $('.header-video')
const video = $('.header-video video')

videoContainer.addEventListener('click', playPause)

let playing = false

video.oncanplay = () => {
  if (window.innerWidth >= 768) {
    video.play()
    videoContainer.classList.add('playing')
    playing = true
  }
}

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