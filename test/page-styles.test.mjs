import assert from 'node:assert/strict'
import test from 'node:test'
import {pageStyles} from '../scripts/page-styles.mjs'

test('page styles omit absent components while keeping their responsive and interactive states', () => {
  const css = '.track{color:red}.menu{display:flex}.menu.active{display:block}@media(max-width:767px){.menu{display:none}.menu.active{display:block}}.light.closed{color:red}#record{color:green}'
  const result = pageStyles(css, '<nav class="menu"></nav><span class="light" id="record"></span>')
  assert.ok(!result.includes('.track'))
  assert.ok(result.includes('.menu.active'))
  assert.ok(result.includes('@media(max-width:767px)'))
  assert.ok(result.includes('.light.closed'))
  assert.ok(result.includes('#record'))
})

test('negation, alternative selectors and quoted attribute values never lose valid styling', () => {
  const css = '.button:not(.disabled){color:red}.button:is(.primary,.secondary){color:blue}.button[data-name="track.jpg"]{display:block}.not-present{display:none}'
  const result = pageStyles(css, '<button class="button primary" data-name="track.jpg">Play</button>')
  for (const selector of ['.button:not(.disabled)', '.button:is(.primary,.secondary)', '.button[data-name="track.jpg"]']) assert.ok(result.includes(selector))
  assert.ok(!result.includes('.not-present'))
})
