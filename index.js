import jsmediatags from "jsmediatags";

const audio = document.getElementById("audio");
const fileInput = document.querySelector("#fileInput");
const dropZone = document.querySelector("#dropZone");
const playBtn = document.querySelector(".play-btn");

let playList = [];
let recentPlays = [];
let nowPlaying = 0;

const MAX_RECENT_LIMIT = 8;

//  FOR THE VISUALIZER
const BAR_COUNT = 64;
const barsContainer = document.querySelector(".bars-container");

// INFO AND CONTROLS


let libraryTracks = [];
let currentView = { type: "library" };

const title = document.querySelector(".track-title");
const coverImg = document.querySelector(".cover-art");
const controlsImg = document.querySelector(".cover-art-controls");
const artist = document.querySelector(".track-artist");
const album = document.querySelector(".track-album");
const duration = document.querySelector(".duration");
const genre = document.querySelector(".genre");
const list = document.querySelector(".play-list");
const lyrics = document.querySelector(".lyrics");
const recent = document.querySelector(".recently-played-list");
const albumsContainer = document.querySelector('.albums')
const artistsContainer = document.querySelector('.artists')
const shuffleBtn = document.querySelector('.shuffle-btn');
const backToLibraryBtn= document.querySelector('.back-to-library');
const customList = document.querySelector(".custom-list");
const loopBtn = document.querySelector(".loop")
const albumsWrap = document.querySelector(".albums-container");
const artistsWrap = document.querySelector(".artists-container");

let loopMode = "off";
let isShuffling = false;
let shuffleHistory = []

const next = document.querySelector(".play-next");
const back = document.querySelector(".play-previous");

const playIcon = document.querySelector('.play-icon')
// VOLUME

const volume = document.querySelector("#volume-bar");
let audioCtx, analyser, source, dataArray, rafId;

volume.addEventListener("input", () => {
  audio.volume = volume.value;
});

// SEEK BAR

const seekBar = document.querySelector(".seek-bar"); // expects <input type="range">
const currentTimeEl = document.querySelector(".current-time");

// IMPORTING THE FILES BY CLICKING OR DRAG AND DROPPING

dropZone.addEventListener("click", () => {
  fileInput.click();
});

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
  dropZone.style.display = "block";
});
window.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("visible");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  handleNewFiles(e.dataTransfer.files); // drop events DO have dataTransfer
  dropZone.classList.remove("dragover");
  dropZone.classList.remove("visible");
});

fileInput.addEventListener("change", (e) => {
  handleNewFiles(e.target.files); // fix: 'change' events use e.target.files, not e.dataTransfer
});

// Shared logic for both import paths: add only the NEW files to the
// playlist, render just those as elements (avoids duplicate re-renders),
// and auto-play the first track only if nothing was playing yet.
function handleNewFiles(fileList) {
  const newFiles = Array.from(fileList).filter((file) =>
    file.type.startsWith("audio/"),
  );
  if (newFiles.length === 0) return;

  const wasEmpty = playList.length === 0;

  playList.push(...newFiles);

buildPlaylist(newFiles).then((results) => {
  results.forEach(({ track }) => libraryTracks.push(track));
  showLibraryView();
});
  if (wasEmpty) {
    nowPlaying = 0;
    loadAndPlay(playList[nowPlaying]);
  }
}

async function loadAndPlay(file) {
  const currentAudioUrl = URL.createObjectURL(file);
  audio.src = currentAudioUrl;

  setupAudioGraph(); // ensure context/analyser exist FIRST
  if (audioCtx.state === "suspended") {
    await audioCtx.resume(); // then wake it up
  }

  audio.play().catch((err) => console.warn("Playback failed:", err));
  // recentPlays.unshift(file)
  loadData(file);
}

// fix: was `if (nowPlaying = playList.length)` — assignment, not comparison,
// which made every track-end reset to track 0 no matter what. Now correctly
// advances to the next track, wrapping to 0 after the last one.
audio.addEventListener("ended", () => {
  // nowPlaying = (nowPlaying + 1) % playList.length;
  // loadAndPlay(playList[nowPlaying]);

  if (playList.length === 0) return;

if (loopMode === "one") {
  loadAndPlay(playList[nowPlaying]);
  return;
}


if (loopMode === "off" && !isShuffling && nowPlaying === playList.length - 1) {
  return;
}

nowPlaying = getNextIndex();
if (isShuffling) shuffleHistory.push(nowPlaying);
loadAndPlay(playList[nowPlaying]);
});

// FUNCTIONALITIES:

// PLAY AND PAUSE
playBtn.addEventListener("click", async () => {
  if (audioCtx.state === "suspended") {
    await audioCtx.resume();
    
  }
  if (audio.paused) {
    audio.play().catch((err) => console.warn("Playback failed:", err));
  } else {
    audio.pause();
  }
});

audio.addEventListener("play", () => {
  
  playIcon.src = "assets/video-pause-button.png"
  draw();
});
audio.addEventListener("pause", () => {
  playIcon.src = "assets/back-button.png"
  cancelAnimationFrame(rafId);
});

// LOAD THE INFO FOR THE CURRENTLY PLAYING TRACK

// jsmediatags is callback-based — wrap it in a Promise so we can use async/await
function readTags(file) {
  return new Promise((resolve, reject) => {
    jsmediatags.read(file, {
      onSuccess: resolve,
      onError: reject,
    });
  });
}

async function loadData(file) {
  let musicObject;
   const id = `${file.name}-${file.size}-${file.lastModified}`;
  try {
    const tag = await readTags(file);
    const { tags } = tag;

    const imageUri = resolveImageUri(tags.picture);
    const shadow = await getAmbientColor(imageUri).catch(() => "0,0,0");
    console.log(file);
    musicObject = {
      id,
      title: tags.title || file.name,
      artist: tags.artist || "Unknown",
      album: tags.album || "Unknown",
      genre: tags.genre || "",
      lyrics: tag.tags.USLT || "No Lyrics",
      imageUri,
      shadow,
    };

    title.textContent = musicObject.title;
    artist.textContent = musicObject.artist;
    album.textContent = musicObject.album;
    genre.textContent = musicObject.genre;
    lyrics.textContent = musicObject.lyrics;

    coverImg.src = musicObject.imageUri;
    controlsImg.src = musicObject.imageUri;
    

    updateAmbientColor(musicObject.imageUri);

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

      if (keyString.includes("lyric") || valueString.includes("lyric")) {
        console.log("POSSIBLE LYRICS:", key, value);
        found = true;
      }
    }

    if (!found) {
      console.log("No obvious lyrics found in the parsed tags.");
    }
  } catch (error) {
    console.error("jsmediatags read failed:", error);

    musicObject = {
      id,
      title: file.name,
      artist: "Unknown",
      album: "Unknown",
      genre: "",
      lyrics: "No Lyrics",
      imageUri: "./assets/default-image.jpg",
      shadow: "0,0,0",
    };

    title.textContent = file.name;
    artist.textContent = "Unknown";
    album.textContent = "Unknown";
    genre.textContent = "";
    coverImg.src = "./assets/default-image.jpg";
    controlsImg.src = "./assets/default-image.jpg";
  }

  updateRecentlyPlayed(musicObject);

  // duration comes from the <audio> element, not from tags — wait for
  // metadata to actually load before reading it, since it's 0/NaN before that
  audio.addEventListener("loadedmetadata", () => {
    const seconds = audio.duration;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60)
      .toString()
      .padStart(2, "0");

    duration.textContent = duration ? `${mins}:${secs}` : "Unknown";
  });
}

function updateRecentlyPlayed(musicObject) {
  const existingIndex = recentPlays.findIndex(
    (item) => item.title === musicObject.title,
  );

  if (existingIndex !== -1) {
    // Track already in the list — pull it out and move it to the front
    const [existing] = recentPlays.splice(existingIndex, 1);
    recentPlays.unshift(existing);
  } else {
    // New track — enforce the cap before adding
    while (recentPlays.length >= MAX_RECENT_LIMIT) {
      recentPlays.pop();
    }
    recentPlays.unshift(musicObject);
  }

  renderRecentlyPlayed();
}

function renderRecentlyPlayed() {
  recent.innerHTML = ""; // clear before re-rendering, or items pile up forever

  recentPlays.forEach(async (track) => {
    console.log(track)
    const html = `
      <div class="recently-played-item" data-id="${track.id}">
        <img src="${track.imageUri}" alt="" class="recently-played-cover" 
        style="box-shadow: 1px 20px 29px -11px rgba(${track.shadow},0.76);
-webkit-box-shadow: 1px 20px 29px -11px rgba(${track.shadow},0.76);
-moz-box-shadow: 1px 20px 29px -11px rgba(${track.shadow},0.76););" />
        <div class="recently-played-meta">
          <span class="recently-played-title">${track.title}</span>
          <span class="recently-played-artist">${track.artist}</span>
        </div>
      </div>`;
    recent.insertAdjacentHTML("beforeend", html);
  });
}
function resolveImageUri(picture) {
  if (!picture || !picture.data) {
    return "./assets/default-image.jpg";
  }
  let base64String = "";
  for (let i = 0; i < picture.data.length; i++) {
    base64String += String.fromCharCode(picture.data[i]);
  }
  return `data:${picture.format};base64,${window.btoa(base64String)}`;
}
recent.addEventListener("click", (e) => {
  const item = e.target.closest(".recently-played-item");
  if (!item) return;

  const clickedId = item.dataset.id;
  const matchedSong = playList.find((song) => {
     const id = `${song.name}-${song.size}-${song.lastModified}`;
    return id === clickedId});
  console.log(playList);

  if (!matchedSong) {
    console.warn("No match found in playlist for:", clickedId);
    return;
  }

  loadAndPlay(matchedSong);
});

// Parses ONE file and returns a fully-built <li> element for the playlist.
async function buildTrackElement(file) {
  const audioUrl = URL.createObjectURL(file);

  const track = {
    file,
    audioUrl,
    title: file.name,
    artist: "Unknown Artist",
    album: "Unknown Album",
    cover: "./assets/default-image.jpg",
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

  const li = buildTrackListItem(track, file)
  

  return {track, file, li};
}

function buildTrackListItem(track, file) {
  const li = document.createElement("li");
  li.className = "playlist-item";

  const img = document.createElement("img");
  img.className = "playlist-item-cover";
  img.src = track.cover || "./assets/default-image.jpg";
  img.alt = `${track.title} cover`;

  const textWrap = document.createElement("div");
  textWrap.className = "playlist-item-text";

  const titleEl = document.createElement("span");
  titleEl.className = "playlist-item-title";
  titleEl.textContent = track.title;

  const artistEl = document.createElement("span");
  artistEl.className = "playlist-item-artist";
  artistEl.textContent = track.artist;

  textWrap.append(titleEl, artistEl);
  li.append(img, textWrap);

  li.addEventListener("click", () => {
    const index = playList.indexOf(file);
    if (index !== -1) {
      nowPlaying = index;
    }
    loadAndPlay(file);
    setupAudioGraph();
  });

  return li;
}

// Takes a FileList or array of Files, filters to audio only, and resolves
// to an array of ready-to-append <li> elements.
async function buildPlaylist(fileList) {
  const files = Array.from(fileList).filter((file) =>
    file.type.startsWith("audio/"),
  );
  if (files.length === 0) return [];

  const results = await Promise.all(files.map(buildTrackElement));
  return results;
}

// NEXT / PREVIOUS

next.addEventListener("click", () => {
  if (playList.length === 0) return;
  nowPlaying = getNextIndex();
  if (isShuffling) shuffleHistory.push(nowPlaying);
  loadAndPlay(playList[nowPlaying]);
  setupAudioGraph();
});

back.addEventListener("click", () => {
  if (playList.length === 0) return;
  nowPlaying = getPrevIndex();
  loadAndPlay(playList[nowPlaying]);
  setupAudioGraph();
});

// SEEK BAR

// tracks whether the user currently has the slider grabbed, so 'timeupdate'
// doesn't fight their drag by resetting the handle position every frame
let isSeeking = false;

function updateProgress() {
  const percent = (audio.currentTime / audio.duration) * 100;

  seekBar.style.setProperty("--progress", `${percent}%`);
}

// Set the slider's range once we know the track's actual length.
// Duration isn't known until the browser loads the file's metadata.
audio.addEventListener("loadedmetadata", () => {
  seekBar.max = audio.duration;
  seekBar.value = 0;

  seekBar.style.setProperty("--progress", "0%")
});

// As the track plays, move the handle and update the time label —
// but only when the user isn't actively dragging it themselves.
audio.addEventListener("timeupdate", () => {
  if (isSeeking) return;
  seekBar.value = audio.currentTime;
   const percent = (audio.currentTime / audio.duration) * 100;

  seekBar.style.setProperty("--progress", `${percent}%`);

  if (currentTimeEl) {
    currentTimeEl.textContent = formatTime(audio.currentTime);
  }
});

// 'input' fires continuously while dragging — use it to show a live preview
// of the time label without actually jumping the audio yet (jumping on every
// pixel of drag is choppy and wastes CPU re-seeking constantly).
seekBar.addEventListener("input", () => {
  isSeeking = true;
  if (currentTimeEl) {
  const percent = (seekBar.value / seekBar.max) * 100;

  seekBar.style.setProperty("--progress", `${percent}%`);

    currentTimeEl.textContent = formatTime(seekBar.value);
  }
});

// 'change' fires once, when the user releases the handle — this is when we
// actually commit the seek to the audio element.
seekBar.addEventListener("change", () => {
  audio.currentTime = seekBar.value;
  const percent = (seekBar.value / seekBar.max) * 100;

  seekBar.style.setProperty("--progress", `${percent}%`);

  isSeeking = false;
});

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
}

const barEls = [];
for (let i = 0; i < BAR_COUNT; i++) {
  const bar = document.createElement("div");
  bar.className = "bar";
  barsContainer.appendChild(bar);
  barEls.push(bar);
}

function setupAudioGraph() {
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

function draw() {
  rafId = requestAnimationFrame(draw);
  analyser.getByteFrequencyData(dataArray);
  for (let i = 0; i < BAR_COUNT; i++) {
    const value = dataArray[i];
    const heightPct = Math.max(2, (value / 255) * 100);
    barEls[i].style.height = heightPct + "%";
  }
}

// DYNAMICLY GETTING COLORS FROM IMAGES

function getAmbientColor(imageUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.crossOrigin = "Anonymous";

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      canvas.width = 50;
      canvas.height = 50;

      ctx.drawImage(img, 0, 0, 50, 50);

      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;

      // Sample every 4th pixel
      for (let i = 0; i < pixels.length; i += 16) {
        const alpha = pixels[i + 3];

        if (alpha < 128) continue;

        r += pixels[i];
        g += pixels[i + 1];
        b += pixels[i + 2];

        count++;
      }

      r = Math.round(r / count);
      g = Math.round(g / count);
      b = Math.round(b / count);

      resolve(`${r}, ${g}, ${b}`);
    };

    img.onerror = reject;
    img.src = imageUrl;
  });
}

async function updateAmbientColor(imageUrl) {
  try {
    const color = await getAmbientColor(imageUrl);

    document.documentElement.style.setProperty("--ambient-color", color);
    console.log(color);
  } catch (error) {
    console.error("Couldn't get album color:", error);
  }
}

function renderTrackList(tracks) {
  list.innerHTML = "";
  tracks.forEach((track) => {
    list.appendChild(buildTrackListItem(track, track.file));
  });
}

function showLibraryView() {
  currentView = { type: "library" };
  // backToLibraryBtn.style.display = "none";
  closeCustomList();
  renderTrackList(libraryTracks);
  renderAlbums();
  renderArtists();
}

function showAlbumView(albumName) {
  currentView = { type: "album", name: albumName };
  const track = libraryTracks.filter((t) => t.album === albumName)
  renderCustomList(track, albumName);
}

function showArtistView(artistName) {
  currentView = { type: "artist", name: artistName };
  const track = libraryTracks.filter((t) => t.artist === artistName)
  renderCustomList(track, artistName);
}


function renderCustomList(tracks, heading) {
  customList.innerHTML = "";

  const backBtn = document.createElement("button");
  backBtn.className = "custom-list-back";
  backBtn.textContent = "← Back";
  backBtn.addEventListener("click", closeCustomList);

  const title = document.createElement("h2");
  title.className = "custom-list-title";
  title.textContent = heading;

  const ul = document.createElement("ul");
  ul.className = "custom-list-tracks";
  tracks.forEach((track) => {
    ul.appendChild(buildTrackListItem(track, track.file));
  });

  customList.append(backBtn, title, ul);
  customList.style.display = "block";

  albumsWrap.style.display = "none";
  artistsWrap.style.display = "none";
}

function closeCustomList() {
  customList.innerHTML = "";
  customList.style.display = "none";
  albumsWrap.style.display = "";
  artistsWrap.style.display = "";
}

function renderAlbums() {
  albumsContainer.innerHTML = "";

  // album name -> { cover, count }
  const albumMap = new Map();
  libraryTracks.forEach((track) => {
    if (!albumMap.has(track.album)) {
      albumMap.set(track.album, { cover: track.cover, count: 0 });
    }
    albumMap.get(track.album).count++;
  });

  albumMap.forEach((info, albumName) => {
    const item = document.createElement("div");
    item.className = "album-item";

    const img = document.createElement("img");
    img.className = "album-item-cover";
    img.src = info.cover;
    img.alt = `${albumName} cover`;

    const label = document.createElement("span");
    const overlay = document.createElement("div")
    overlay.appendChild(label)
    overlay.classList.add('album-item-overlay')
    label.className = "album-item-name";
    label.textContent = `${albumName} (${info.count})`;

    item.append(img, overlay);
    item.addEventListener("click", () => showAlbumView(albumName));
    albumsContainer.appendChild(item);
  });
}

function renderArtists() {
  artistsContainer.innerHTML = "";

  const artistNames = new Set(libraryTracks.map((t) => t.artist));

  artistNames.forEach((artistName) => {
    const item = document.createElement("div");
    item.className = "artist-item";
    item.textContent = artistName;
    item.addEventListener("click", () => showArtistView(artistName));
    artistsContainer.appendChild(item);
  });
}

// SHUFFLE / LOOP

shuffleBtn.addEventListener("click", () => {
  isShuffling = !isShuffling;
  shuffleBtn.classList.toggle("active", isShuffling);
  shuffleHistory = [nowPlaying];
});

loopBtn.addEventListener("click", () => {
  loopMode = loopMode === "off" ? "all" : loopMode === "all" ? "one" : "off";
  loopBtn.classList.remove("loop-all", "loop-one");
  if (loopMode !== "off") loopBtn.classList.add(`loop-${loopMode}`);
});

function getNextIndex() {
  if (playList.length <= 1) return nowPlaying;

  if (isShuffling) {
    let next;
    do {
      next = Math.floor(Math.random() * playList.length);
    } while (next === nowPlaying);
    return next;
  }

  return (nowPlaying + 1) % playList.length;
}

function getPrevIndex() {
  if (playList.length === 0) return nowPlaying;

  if (isShuffling && shuffleHistory.length > 1) {
    shuffleHistory.pop(); // drop the current track
    return shuffleHistory[shuffleHistory.length - 1];
  }

  return (nowPlaying - 1 + playList.length) % playList.length;
}
