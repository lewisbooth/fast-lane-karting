"use strict";var video=$(".header-video video"),videoContainer=$(".header-video");function playPause(){video.paused?(video.play(),videoContainer.classList.add("playing")):(video.pause(),videoContainer.classList.remove("playing"))}videoContainer.addEventListener("click",playPause),video.addEventListener("canplay",function(){768<=window.innerWidth&&(video.play(),videoContainer.classList.add("playing"))});