const instafeed = $("#instafeed").getBoundingClientRect()
const placeholders = $$(".social-feed-instagram-post")

// Trigger when viewport gets within OFFSET pixels of Instafeed
const OFFSET = 500
const SETTINGS = {
  get: "user",
  userId: "9364333745",
  clientId: "156a89869a864d659d801edacca1e88e",
  accessToken: "9364333745.156a898.ec865e6cf1d24951a78bca7c4406208e",
  resolution: "low_resolution",
  sortBy: "most-recent",
  limit: "6",
  template: `
    <a class='social-feed-instagram-post' href={{link}} target='_blank'>
      <img src='{{image}}'>
    </a>`,
  after: removePlaceholders
}

// Flag prevents multiple triggers
let triggered = false

function loadImages() {
  if (triggered) return
  // Configure Instafeed library
  const feed = new Instafeed(SETTINGS)
  if (window.pageYOffset > instafeed.top - window.innerHeight - OFFSET) {
    // Load images if viewport is close to the feed
    feed.run()
    triggered = true
  } else {
    // Otherwise retry on page scroll
    window.addEventListener("scroll", loadImages)
  }
}

// Remove empty placeholder blocks
function removePlaceholders() {
  for (let i = 0; i < placeholders.length; i++) {
    removeElement(placeholders[i])
  }
  setTimeout(fadeIn, 50)
}

// Once images are loaded, fade them in via CSS
function fadeIn() {
  const posts = $$(".social-feed-instagram-post")
  for (let i = 0; i < posts.length; i++) {
    posts[i].classList.add('loaded')
  }
}

// Because IE11 doesn't support e.remove()
function removeElement(element) {
  element && element.parentNode && element.parentNode.removeChild(element);
}
