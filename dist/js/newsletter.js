"use strict";var newsletterForm=document.forms.newsletter,emailInput=newsletterForm.querySelector('input[type="email"]'),API_KEY="QGh25n3ixH3jm9hpRG1pd5PJQ4QXOL5L74b9Xi3C",API_ENDPOINT="https://74386ydfki.execute-api.eu-west-1.amazonaws.com/production/fastLaneNewsletter";function submitNewsletterForm(e){e.preventDefault();var t=JSON.stringify({email:emailInput.value});axios({url:API_ENDPOINT,data:t,method:"POST",headers:{"x-api-key":API_KEY}}).then(function(e){return console.log(e)}).catch(function(e){return console.log(e.response)})}newsletterForm.addEventListener("submit",submitNewsletterForm);