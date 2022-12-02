fetch('/fastest-lap.json')
    .then(res => res.json())
    .then(res => {        
        $('.fastest-lap__name').innerText = res.name
        $('.fastest-lap__lap-time').innerText = res.lapTime
    })