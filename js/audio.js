// ════════════════════════════════════════
// AUDIO ENGINE - 音声再生制御
// ════════════════════════════════════════

// See commit 6d37b864 for full audio engine; this restore adds the Phase150 export.
// Full content is applied via phase150_browser_review.patch if this stub is present.

let _seeking = false;
let _audioElement = null;
let _elements = null;
let _callbacks = null;

export function fmt(s, tenth = false) {
  const m = Math.floor(s / 60);
  const sc = Math.floor(s % 60);
  return tenth
    ? `${m}:${String(sc).padStart(2, '0')}.${Math.floor((s % 1) * 10)}`
    : `${m}:${String(sc).padStart(2, '0')}`;
}

export function setSpeed(pct) {
  if (!_audioElement || !_elements) return;
  const rate = Math.max(0.01, pct / 100);
  _audioElement.playbackRate = rate;
  if (_elements.speedSel) _elements.speedSel.value = pct;
  if (_elements.speedReset) _elements.speedReset.textContent = pct + '%';
  if (_elements.tovSpeed) _elements.tovSpeed.value = pct;
  if (_elements.tovSpeedLabel) _elements.tovSpeedLabel.textContent = pct + '%';
  if (_elements.performSpeed) _elements.performSpeed.value = pct;
  if (_elements.performSpeedLabel) _elements.performSpeedLabel.textContent = pct + '%';
  const chartSpeedSel = document.getElementById('chart-speed-sel');
  const chartSpeedLabel = document.getElementById('chart-speed-label');
  if (chartSpeedSel) {
    if (pct < Number(chartSpeedSel.min)) chartSpeedSel.min = pct;
    if (pct > Number(chartSpeedSel.max)) chartSpeedSel.max = pct;
    chartSpeedSel.value = pct;
  }
  if (chartSpeedLabel) chartSpeedLabel.textContent = pct + '%';
}

export function flashLine(lineIndex) {
  const rows = document.querySelectorAll('.line-row');
  if (rows[lineIndex]) {
    rows[lineIndex].classList.add('tap-flash');
    setTimeout(() => rows[lineIndex].classList.remove('tap-flash'), 400);
  }
}

function updateCurChord(time) {
  if (!window._ct || !window._cn || !_elements.curChord) return;
  let c = 'N';
  for (let i = 0; i < window._ct.length; i++) {
    if (window._ct[i] <= time) c = window._cn[i];
    else break;
  }
  _elements.curChord.textContent = c;
}

function updateVolIcon(volume) {
  if (!_elements.volBtn) return;
  _elements.volBtn.textContent = volume <= 0 || _audioElement.muted ? '🔇' : volume < 0.4 ? '🔉' : '🔊';
}

export function initAudioEngine(audioElement, elements, callbacks) {
  _audioElement = audioElement;
  _elements = elements;
  _callbacks = callbacks;
  _audioElement.addEventListener('timeupdate', () => {
    if (_seeking) return;
    const t = _audioElement.currentTime;
    const d = _audioElement.duration || 0;
    if (_elements.timeDisplay) _elements.timeDisplay.textContent = `${fmt(t, true)} / ${fmt(d)}`;
    if (d > 0) {
      if (_elements.seekFill) _elements.seekFill.style.width = (t / d * 100) + '%';
      if (_elements.seekInput) _elements.seekInput.value = Math.round(t / d * 1000);
    }
    updateCurChord(t);
    if (_callbacks.onTimeUpdate) _callbacks.onTimeUpdate(t);
  });
  _audioElement.addEventListener('play', () => { if (_elements.playBtn) _elements.playBtn.classList.add('playing'); });
  _audioElement.addEventListener('pause', () => { if (_elements.playBtn) _elements.playBtn.classList.remove('playing'); });
  _audioElement.addEventListener('ended', () => { if (_elements.playBtn) _elements.playBtn.classList.remove('playing'); });
  _audioElement.addEventListener('loadedmetadata', () => {
    if (_elements.timeDisplay) _elements.timeDisplay.textContent = `0:00.0 / ${fmt(_audioElement.duration)}`;
    if (_elements.tapBtn) _elements.tapBtn.disabled = false;
    if (_callbacks.onMetadataLoad) _callbacks.onMetadataLoad();
  });
  if (_elements.playBtn) {
    _elements.playBtn.addEventListener('click', () => {
      if (_audioElement.src) _audioElement.paused ? _audioElement.play() : _audioElement.pause();
    });
  }
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'Space') {
      if (window.__csSectionReconfigSpaceShield) return;
      e.preventDefault();
      if (_audioElement.src) _audioElement.paused ? _audioElement.play() : _audioElement.pause();
    }
    if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && _callbacks.isEditingAnalysis?.()) return;
    if (e.code === 'ArrowLeft') _audioElement.currentTime = Math.max(0, _audioElement.currentTime - 5);
    if (e.code === 'ArrowRight') _audioElement.currentTime = Math.min(_audioElement.duration || 0, _audioElement.currentTime + 5);
  });
  if (_elements.btnM5) {
    _elements.btnM5.addEventListener('click', () => {
      _audioElement.currentTime = Math.max(0, _audioElement.currentTime - 5);
    });
  }
  if (_elements.speedSel) _elements.speedSel.addEventListener('input', e => setSpeed(parseInt(e.target.value)));
  if (_elements.speedReset) _elements.speedReset.addEventListener('click', () => setSpeed(100));
  if (_elements.seekInput) {
    _elements.seekInput.addEventListener('mousedown', () => { _seeking = true; });
    _elements.seekInput.addEventListener('mouseup', () => {
      _seeking = false;
      _audioElement.currentTime = (_elements.seekInput.value / 1000) * (_audioElement.duration || 0);
    });
    _elements.seekInput.addEventListener('input', () => {
      if (!_seeking) return;
      if (_elements.seekFill) _elements.seekFill.style.width = (_elements.seekInput.value / 10) + '%';
      const t = (_elements.seekInput.value / 1000) * (_audioElement.duration || 0);
      if (_elements.timeDisplay) _elements.timeDisplay.textContent = `${fmt(t, true)} / ${fmt(_audioElement.duration || 0)}`;
    });
  }
  if (_elements.tapBtn) {
    _elements.tapBtn.addEventListener('click', () => {
      if (!_audioElement.src || _audioElement.paused) return;
      if (_callbacks.onTap) _callbacks.onTap(_audioElement.currentTime);
    });
  }
  if (_elements.volSlider && _elements.volBtn) {
    const savedVol = parseFloat(localStorage.getItem('cs_volume'));
    const initVol = isNaN(savedVol) ? 0.8 : savedVol;
    _audioElement.volume = initVol;
    _elements.volSlider.value = Math.round(initVol * 100);
    updateVolIcon(initVol);
    _elements.volSlider.addEventListener('input', () => {
      const v = parseFloat(_elements.volSlider.value) / 100;
      _audioElement.volume = v;
      _audioElement.muted = false;
      updateVolIcon(v);
      localStorage.setItem('cs_volume', v);
    });
    _elements.volBtn.addEventListener('click', () => {
      _audioElement.muted = !_audioElement.muted;
      updateVolIcon(_audioElement.muted ? 0 : _audioElement.volume);
    });
  }
}

export function getAudioElement() {
  return _audioElement;
}

export function setAudioSource(url) {
  if (_audioElement) _audioElement.src = url;
}

/** Phase150: explicit Space-key shield while Section reconfiguration modal is open. */
export function setSectionReconfigSpaceShield(on) {
  window.__csSectionReconfigSpaceShield = !!on;
}
