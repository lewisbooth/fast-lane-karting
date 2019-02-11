const videoContainer = $('.header-video')
const video = $('.header-video video')

videoContainer.addEventListener('click', playPause)

// Play video as soon as it's ready
video.addEventListener('canplay', function () {
  // Don't autoplay on mobiles
  if (window.innerWidth < 768)
    return
  video.play()
  videoContainer.classList.add('playing')
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