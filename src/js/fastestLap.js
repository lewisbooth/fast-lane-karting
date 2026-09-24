import { $ } from './dollarSelect.js'
import fastestLap from '../static/fastest-lap.json'

$('.fastest-lap__name').innerText = fastestLap.name
$('.fastest-lap__lap-time').innerText = fastestLap.lapTime
