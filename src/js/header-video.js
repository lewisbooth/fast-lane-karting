const video = $('.header-video video')
const videoContainer = $('.header-video')

videoContainer.addEventListener('click', playPause)

// Play video as soon as it's ready
video.addEventListener('canplay', function () {
  if (window.innerWidth >= 768) {
    video.play()
    videoContainer.classList.add('playing')
  }
})

function playPause() {
  if (video.paused) {
    video.play()
    videoContainer.classList.add('playing')
  } else {
    video.pause()
    videoContainer.classList.remove('playing')
  }
}