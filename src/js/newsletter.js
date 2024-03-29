// Uses an AWS Lambda function to handle contact form requests
// AWS API Gateway throttles and denies bad requests

const newsletterForm = document.forms['newsletter']
const emailInput = newsletterForm.querySelector('input[type="email"]')

const API_KEY = 'QGh25n3ixH3jm9hpRG1pd5PJQ4QXOL5L74b9Xi3C'
const API_ENDPOINT = 'https://74386ydfki.execute-api.eu-west-1.amazonaws.com/production/fastLaneNewsletter'

newsletterForm.addEventListener('submit', submitNewsletterForm)


function submitNewsletterForm(e) {
  e.preventDefault()
  const data = JSON.stringify({ email: emailInput.value })
  fetch(API_ENDPOINT, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY
    },
    body: data
  })
    .then(res => window.location = '/success')
    .catch(err => {
      console.log(err.response)
      window.location = '/error'
    })
}
