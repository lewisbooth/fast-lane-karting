import { $ } from './dollarSelect.js'

const video = $('.header-video video')
const videoContainer = $('.header-video')
const fullscreenButton = $('.header-video__controls--right--fullscreen')
const playPauseButton = $('.header-video__controls--play-pause')
const muteButton = $('.header-video__controls--right--audio')
const status = $('.header-video__status')

function updateControls() {
  videoContainer.classList.toggle('playing', !video.paused)
  videoContainer.classList.toggle('unmuted', !video.muted)
  playPauseButton.setAttribute('aria-label', video.paused ? 'Play video' : 'Pause video')
  muteButton.setAttribute('aria-label', video.muted ? 'Unmute video' : 'Mute video')
}

async function play() {
  try {
    await video.play()
    status.textContent = ''
  } catch {
    status.textContent = 'The video could not be played. Please try again.'
  }
  updateControls()
}

playPauseButton.addEventListener('click', () => {
  if (video.paused) void play()
  else video.pause()
})
muteButton.addEventListener('click', () => {
  video.muted = !video.muted
  updateControls()
})
fullscreenButton.addEventListener('click', async () => {
  try {
    if (videoContainer.requestFullscreen) await videoContainer.requestFullscreen()
    else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen()
    if (video.paused) await play()
  } catch {
    status.textContent = 'Fullscreen is unavailable. You can still watch the video on this page.'
  }
})
video.addEventListener('play', updateControls)
video.addEventListener('playing', () => videoContainer.classList.add('started'))
video.addEventListener('pause', updateControls)
video.addEventListener('volumechange', updateControls)
document.addEventListener('fullscreenchange', () => {
  video.controls = document.fullscreenElement === video
})
updateControls()
