export function initMediaEmbeds() {
  for (const embed of document.querySelectorAll('[data-embed-src]')) {
    const stage = embed.querySelector('.media-embed__stage')
    const button = embed.querySelector('.media-embed__load')
    if (!stage || !button) continue

    button.hidden = false
    button.addEventListener('click', () => {
      const frame = document.createElement('iframe')
      frame.className = 'media-embed__frame'
      frame.src = embed.dataset.embedSrc
      frame.title = embed.dataset.embedTitle || button.textContent.trim()
      frame.loading = 'eager'
      frame.allowFullscreen = true
      frame.tabIndex = 0
      stage.replaceChildren(frame)
      frame.focus({ preventScroll: true })
    }, { once: true })
  }

  for (const facade of document.querySelectorAll('[data-video-src]')) {
    const trigger = facade.querySelector('.media-video__trigger')
    if (!trigger) continue

    trigger.addEventListener('click', event => {
      event.preventDefault()
      const video = document.createElement('video')
      video.className = 'media-video__player'
      video.src = facade.dataset.videoSrc
      video.controls = true
      video.autoplay = true
      video.playsInline = true
      video.preload = 'none'
      video.tabIndex = 0
      video.setAttribute('aria-label', 'Onboard video of the Fast Lane Karting track')
      trigger.replaceWith(video)
      video.focus({ preventScroll: true })
      void video.play().catch(() => {
        // Native controls remain available if autoplay is blocked.
      })
    }, { once: true })
  }
}

if (typeof document !== 'undefined') initMediaEmbeds()
