import jsmediatags from 'jsmediatags';

const audio = document.getElementById("audio");
const fileInput = document.querySelector("#fileInput");
const dropZone = document.querySelector("#dropZone");
const playBtn = document.querySelector(".play-btn");

let playList = [];
let nowPlaying = 0;


//  FOR THE VISUALIZER
const BAR_COUNT = 64;
const barsContainer= document.querySelector(".bars-container");



// INFO AND CONTROLS

const title = document.querySelector('.track-title');
const coverImg = document.querySelector('.cover-art');
const artist = document.querySelector('.track-artist');
const album = document.querySelector('.track-album');
const duration = document.querySelector('.duration');
const genre = document.querySelector('.genre');
const list = document.querySelector('.play-list');
const lyrics = document.querySelector('.lyrics')

const next = document.querySelector('.play-next');
const back = document.querySelector('.play-previous');

// VOLUME

const volume = document.querySelector("#volume-bar");
let audioCtx, analyser, source, dataArray, rafId;

volume.addEventListener("input", () => {
    audio.volume = volume.value;
});

// SEEK BAR

const seekBar = document.querySelector('.seek-bar'); // expects <input type="range">
const currentTimeEl = document.querySelector('.current-time');


// IMPORTING THE FILES BY CLICKING OR DRAG AND DROPPING

dropZone.addEventListener("click", () => {
    fileInput.click();
});

dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    handleNewFiles(e.dataTransfer.files); // drop events DO have dataTransfer
});

fileInput.addEventListener("change", (e) => {
    handleNewFiles(e.target.files); // fix: 'change' events use e.target.files, not e.dataTransfer
});

// Shared logic for both import paths: add only the NEW files to the
// playlist, render just those as elements (avoids duplicate re-renders),
// and auto-play the first track only if nothing was playing yet.
function handleNewFiles(fileList) {
    const newFiles = Array.from(fileList).filter(file => file.type.startsWith('audio/'));
    if (newFiles.length === 0) return;

    const wasEmpty = playList.length === 0;

    playList.push(...newFiles);

    buildPlaylist(newFiles).then(elements => {
        elements.forEach(li => list.appendChild(li));
    });

    if (wasEmpty) {
        nowPlaying = 0;
        loadAndPlay(playList[nowPlaying]);
    }
}

async function loadAndPlay(file) {
    const currentAudioUrl = URL.createObjectURL(file);
    audio.src = currentAudioUrl;

    setupAudioGraph();                    // ensure context/analyser exist FIRST
    if (audioCtx.state === 'suspended') {
        await audioCtx.resume();          // then wake it up
    }

    audio.play().catch(err => console.warn('Playback failed:', err));
    loadData(file);
}

// fix: was `if (nowPlaying = playList.length)` — assignment, not comparison,
// which made every track-end reset to track 0 no matter what. Now correctly
// advances to the next track, wrapping to 0 after the last one.
audio.addEventListener('ended', () => {
    nowPlaying = (nowPlaying + 1) % playList.length;
    loadAndPlay(playList[nowPlaying]);
});


// FUNCTIONALITIES:

// PLAY AND PAUSE
playBtn.addEventListener("click", async () => {
    if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
    }
    if (audio.paused) {
        audio.play().catch(err => console.warn('Playback failed:', err));
    } else {
        audio.pause();
    }
});

audio.addEventListener('play', () => {
    playBtn.textContent = 'Pause';
    draw();
});
audio.addEventListener('pause', () => {
    playBtn.textContent = 'Play';
    cancelAnimationFrame(rafId);
});


// LOAD THE INFO FOR THE CURRENTLY PLAYING TRACK

// jsmediatags is callback-based — wrap it in a Promise so we can use async/await
function readTags(file) {
    return new Promise((resolve, reject) => {
        jsmediatags.read(file, {
            onSuccess: resolve,
            onError: reject
        });
    });
}

async function loadData(file) {
    try {
        const tag = await readTags(file);
        const { tags } = tag;

        const musicObject = {
            title: tags.title || file.name, 
            artist:tags.artist || "Unknown" , 
            album: tags.album || "Unknown",
            genre:tags.genre || "" , 
            lyrics: tag.tags.USLT||"No Lyrics",
            picture: tags.picture || "./images/no-cover"
        }

        title.textContent = musicObject.title;
        artist.textContent = musicObject.artist;
        album.textContent = musicObject.album;
        genre.textContent = musicObject.lyrics;

        if (tag.tags.USLT) {
                console.log("USLT FOUND:", tag.tags.USLT);
            }

            // 2. Synchronized lyrics
            if (tag.tags.SYLT) {
                console.log("SYLT FOUND:", tag.tags.SYLT);
            }

            // 3. User-defined text
            if (tag.tags.TXXX) {
                console.log("TXXX FOUND:", tag.tags.TXXX);
            }

            // 4. Comments
            if (tag.tags.COMM) {
                console.log("COMM FOUND:", tag.tags.COMM);
            }

            // 5. Lyrics3
            if (tag.tags.Lyrics3) {
                console.log("Lyrics3 FOUND:", tag.tags.Lyrics3);
            }

            // 6. Check every tag for the word "lyric"
            let found = false;

            for (const [key, value] of Object.entries(tag.tags)) {

                const keyString = key.toLowerCase();
                const valueString = JSON.stringify(value).toLowerCase();

                if (
                    keyString.includes("lyric") ||
                    valueString.includes("lyric")
                ) {
                    console.log("POSSIBLE LYRICS:", key, value);
                    found = true;
                }
            }

            if (!found) {
                console.log("No obvious lyrics found in the parsed tags.");
            }
        
    } catch (error) {
        console.error("jsmediatags read failed:", error);
        title.textContent = file.name;
        artist.textContent = "Unknown";
        album.textContent = "Unknown";
        genre.textContent = "";
    }

    
    // duration comes from the <audio> element, not from tags — wait for
    // metadata to actually load before reading it, since it's 0/NaN before that
    audio.addEventListener('loadedmetadata', () => {
        const seconds = audio.duration;
        const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    
        duration.textContent = duration
            ?  `${mins}:${secs}`
            : "Unknown";
    });
}


// SYNCINGN THE LYRICS

// function lyricsHelper(){
//     const lyrics = [
//     { time: 12.5, text: "First line" },
//     { time: 16.2, text: "Second line" },
//     { time: 20.8, text: "Third line" }
// ];
// }

// audio.addEventListener("timeupdate", () => {
//     const currentTime = audio.currentTime;

//     let currentLyric = null;

//     for (const lyric of lyrics) {
//         if (lyric.time <= currentTime) {
//             currentLyric = lyric;
//         } else {
//             break;
//         }
//     }

//     if (currentLyric) {
//         console.log(currentLyric.text);
//     }
// });

// BUILD PLAYLIST <li> ELEMENTS

// Parses ONE file and returns a fully-built <li> element for the playlist.
async function buildTrackElement(file) {
    const audioUrl = URL.createObjectURL(file);

    const track = {
        file,
        audioUrl,
        title: file.name,
        artist: "Unknown Artist",
        album: "Unknown Album",
        cover: null,
    };

    try {
        const tag = await readTags(file);
        const { tags } = tag;

        track.title = tags.title || file.name;
        track.artist = tags.artist || "Unknown Artist";
        track.album = tags.album || "Unknown Album";

        if (tags.picture) {
            const { data, format } = tags.picture;
            const blob = new Blob([new Uint8Array(data)], { type: format });
            track.cover = URL.createObjectURL(blob);
        }
    } catch (error) {
        console.warn(`Could not read tags for "${file.name}":`, error);
    }

    const li = document.createElement('li');
    li.className = 'playlist-item';

    const img = document.createElement('img');
    img.className = 'playlist-item-cover';
    img.src = track.cover || '';
    img.alt = `${track.title} cover`;

    const textWrap = document.createElement('div');
    textWrap.className = 'playlist-item-text';

    const titleEl = document.createElement('span');
    titleEl.className = 'playlist-item-title';
    titleEl.textContent = track.title;

    const artistEl = document.createElement('span');
    artistEl.className = 'playlist-item-artist';
    artistEl.textContent = track.artist;

    textWrap.append(titleEl, artistEl);
    li.append(img, textWrap);

    // fix: clicking a track now updates `nowPlaying` to the correct index
    // (found by locating this exact file in the shared playList array),
    // so the 'ended' handler correctly continues from THIS track onward
    li.addEventListener('click', () => {
        const index = playList.indexOf(file);
        if (index !== -1) {
            nowPlaying = index;
        }
        loadAndPlay(file);
        setupAudioGraph()
    });

    return li;
}

// Takes a FileList or array of Files, filters to audio only, and resolves
// to an array of ready-to-append <li> elements.
async function buildPlaylist(fileList) {
    const files = Array.from(fileList).filter(file => file.type.startsWith('audio/'));
    if (files.length === 0) return [];

    const elements = await Promise.all(files.map(buildTrackElement));
    return elements;
}

// NEXT / PREVIOUS
 
next.addEventListener('click', () => {
    if (playList.length === 0) return;
    // wraps to the first track after the last one, same logic as 'ended'
    nowPlaying = (nowPlaying + 1) % playList.length;
    loadAndPlay(playList[nowPlaying]);
    setupAudioGraph();
});

back.addEventListener('click', () => {
    if (playList.length === 0) return;
    // going below 0 needs its own wrap — modulo alone doesn't handle negative
    // numbers the way you'd want in JS, so add playList.length before the % to keep it positive
    nowPlaying = (nowPlaying - 1 + playList.length) % playList.length;
    loadAndPlay(playList[nowPlaying]);
    setupAudioGraph();
});
 
 
// SEEK BAR
 
// tracks whether the user currently has the slider grabbed, so 'timeupdate'
// doesn't fight their drag by resetting the handle position every frame
let isSeeking = false;
 
// Set the slider's range once we know the track's actual length.
// Duration isn't known until the browser loads the file's metadata.
audio.addEventListener('loadedmetadata', () => {
    seekBar.max = audio.duration;
    seekBar.value = 0;
});
 
// As the track plays, move the handle and update the time label —
// but only when the user isn't actively dragging it themselves.
audio.addEventListener('timeupdate', () => {
    if (isSeeking) return;
    seekBar.value = audio.currentTime;
    if (currentTimeEl) {
        currentTimeEl.textContent = formatTime(audio.currentTime);
    }
});
 
// 'input' fires continuously while dragging — use it to show a live preview
// of the time label without actually jumping the audio yet (jumping on every
// pixel of drag is choppy and wastes CPU re-seeking constantly).
seekBar.addEventListener('input', () => {
    isSeeking = true;
    if (currentTimeEl) {
        currentTimeEl.textContent = formatTime(seekBar.value);
    }
});
 
// 'change' fires once, when the user releases the handle — this is when we
// actually commit the seek to the audio element.
seekBar.addEventListener('change', () => {
    audio.currentTime = seekBar.value;
    isSeeking = false;
});
 
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
}


const barEls = [];
for (let i = 0; i < BAR_COUNT; i++) {
  const bar = document.createElement('div');
  bar.className = 'bar';
  barsContainer.appendChild(bar);
  barEls.push(bar);
}

function setupAudioGraph () {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.8;
    source = audioCtx.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    dataArray = new Uint8Array(analyser.frequencyBinCount);
}

function draw(){
    rafId = requestAnimationFrame(draw);
    analyser.getByteFrequencyData(dataArray);
    for (let i = 0; i < BAR_COUNT; i++) {
    const value = dataArray[i];
    const heightPct = Math.max(2, (value / 255) * 100);
    barEls[i].style.height = heightPct + '%';
  }
}