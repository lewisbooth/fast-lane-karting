"use strict";var light=$(".nav__right--contact--opening-hours--light"),label=$(".nav__right--contact--opening-hours--light span"),date=new Date,day=date.getDay(),hour=date.getHours(),minutes=date.getMinutes();function updateLight(){changeStatus(10<=hour&&hour<22?"open-now":6==day&&9<=hour&&hour<22?"open-now":22==hour&&minutes<30?"closing-soon":"closed")}function changeStatus(t){console.log(t),light.classList.add(t),label.textContent=t.replace("-"," ")}updateLight(),setTimeout(updateLight,3600);