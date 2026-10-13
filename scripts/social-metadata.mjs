export const siteOrigin = 'https://fastlanekarting.co.uk'

function metaContent(html, name) {
  const matches = [...html.matchAll(/<meta\s+(?:name|property)="([^"]+)"\s+content="([^"]*)"[^>]*>/g)]
    .filter(match => match[1] === name)
  if (matches.length !== 1 || !matches[0][2].trim()) throw new Error(`Expected one non-empty ${name} tag`)
  return matches[0][2]
}

function titleAttribute(title) {
  // Preserve entities already present in HTML while escaping literal text for
  // an attribute. Descriptions and image alt text are already escaped by Pug.
  return title.replace(/&(?!(?:[a-z][a-z0-9]+|#\d+|#x[0-9a-f]+);)/gi, '&amp;')
    .replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

export function addSocialMetadata(html, pageName) {
  const titles = [...html.matchAll(/<title>([\s\S]*?)<\/title>/g)]
  if (titles.length !== 1 || !titles[0][1].trim()) throw new Error(`Expected one title for ${pageName}`)
  const title = titleAttribute(titles[0][1].trim())
  const description = metaContent(html, 'description')
  const image = metaContent(html, 'og:image')
  const imageAlt = metaContent(html, 'og:image:alt')
  const url = `${siteOrigin}${pageName === 'index' ? '/' : `/${pageName}`}`
  const tags = [
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Fast Lane Karting">',
    '<meta property="og:locale" content="en_GB">',
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${description}">`,
    `<meta name="twitter:image" content="${image}">`,
    `<meta name="twitter:image:alt" content="${imageAlt}">`
  ]
  // The shared 404 page is served for arbitrary missing URLs, so it must not
  // claim that those URLs are canonically /404. Its template already has noindex.
  if (pageName !== '404') {
    tags.push(`<link rel="canonical" href="${url}">`, `<meta property="og:url" content="${url}">`)
  }
  if (!html.includes('</head>')) throw new Error(`Missing head for ${pageName}`)
  return html.replace('</head>', tags.join('') + '</head>')
}

export function absoluteSocialImageUrls(html) {
  return html.replace(/(<meta\s+(?:property|name)="(?:og:image|twitter:image)"\s+content=")([^"]+)"/g,
    (tag, prefix, pathname) => {
      if (!pathname.startsWith('/immutable/')) throw new Error(`Sharing image must be versioned: ${pathname}`)
      return `${prefix}${siteOrigin}${pathname}"`
    })
}
