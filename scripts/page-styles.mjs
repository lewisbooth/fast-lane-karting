import postcss from 'postcss'

// Added by the menu, video and opening-hours modules after HTML is loaded.
const dynamicClasses = ['active', 'playing', 'started', 'unmuted', 'open-now', 'closed', 'closing-soon', 'loaded']

export function pageStyles(css, html) {
  const classes = new Set([...dynamicClasses, ...[...html.matchAll(/\bclass="([^"]*)"/g)].flatMap(match => match[1].split(/\s+/))])
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]))
  const styles = postcss.parse(css)
  styles.walkRules(rule => {
    const selectors = rule.selectors.filter(selector => {
      // A token inside :not(), selector alternatives or an attribute value is
      // not necessarily a required class. Retain complex selectors unchanged.
      if (/[\\\[]|:(?:not|is|where|has)\(/.test(selector)) return true
      return [...selector.matchAll(/\.([_a-zA-Z][\w-]*)/g)].every(match => classes.has(match[1])) &&
        [...selector.matchAll(/#([_a-zA-Z][\w-]*)/g)].every(match => ids.has(match[1]))
    })
    if (selectors.length) rule.selectors = selectors
    else rule.remove()
  })
  styles.walkAtRules(rule => { if (rule.nodes && !rule.nodes.length) rule.remove() })
  return styles.toString()
}
