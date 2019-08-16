const video = $('.header-video video')
const videoContainer = $('.header-video')
const fullscreenButton = $('.header-video__controls--right--fullscreen')
const playPauseButton = $('.header-video__controls--play-pause')
const muteButton = $('.header-video__controls--right--audio')

fullscreenButton.addEventListener('click', toggleFullScreen)
playPauseButton.addEventListener('click', togglePlay)
muteButton.addEventListener('click', toggleMute)

function togglePlay() {
  video.paused ? play() : pause()
}

function toggleMute() {
  video.muted ? unmute() : mute()
}

function play() {
  video.play()
  videoContainer.classList.add('playing')
}

function pause() {
  video.pause()
  videoContainer.classList.remove('playing')
}

function mute() {
  video.muted = true
  videoContainer.classList.remove('unmuted')
}

function unmute() {
  video.muted = false
  videoContainer.classList.add('unmuted')
}

// Autoplay video
video.addEventListener('canplay', () => {
  if (window.innerWidth >= 768)
    play()
})

function toggleFullScreen() {
  if (video.mozRequestFullScreen) {
    video.mozRequestFullScreen()
    unmute()
  } else if (video.webkitRequestFullScreen) {
    video.webkitRequestFullScreen()
    unmute()
  }
}