$("script[src='/js/libs/axios.js']").onload = () => getFastestLap()

function getFastestLap() {
    axios.get('/fastest-lap.json')
        .then(updateFastestLap)
        .catch(err => {
             console.error('Failed to get fastest lap data')
             console.error(err)
        })
}

function updateFastestLap(response) {
    const { name, lapTime } = response.data
    if (!name || !lapTime) 
        return console.error("Incorrect Lap Time Data")
    $('.fastest-lap__name').innerText = name
    $('.fastest-lap__lap-time').innerText = lapTime
}