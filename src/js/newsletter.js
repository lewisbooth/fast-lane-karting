const newsletterForm = document.forms['newsletter']
const emailInput = newsletterForm.querySelector('input[type="email"]')
const submitButton = newsletterForm.querySelector('button[type="submit"]')

newsletterForm.addEventListener('submit', submitNewsletterForm)


async function submitNewsletterForm(e) {
  e.preventDefault()
  if (submitButton.disabled) return
  submitButton.disabled = true
  try {
    const response = await fetch('/api/newsletter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailInput.value })
    })
    const result = await response.json()
    if (!response.ok || result.success !== true) throw new Error('Signup failed')
    window.location.assign('/success')
  } catch {
    window.location.assign('/error')
  }
}
