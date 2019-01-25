var placeholders = $$(".social-feed-instagram-post")

var feed = new Instafeed({
  get: "user",
  after: function () {
    for (let i = 0; i < placeholders.length; i++) {
      placeholders[i].remove()
    }
  },
  userId: "9364333745",
  clientId: "156a89869a864d659d801edacca1e88e",
  accessToken: "9364333745.156a898.ec865e6cf1d24951a78bca7c4406208e",
  resolution: "low_resolution",
  sortBy: "most-recent",
  limit: "6",
  template:
    "<a class='social-feed-instagram-post' href={{link}} target='_blank' style='background-image: url({{image}}); background-size: cover; background-position: center;'/>"
})

feed.run()