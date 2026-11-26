const tracks = [
  { name: 'キック', color: '#d8fa83', pattern: [0, 6, 8, 10] },
  { name: 'スネア', color: '#ffa98b', pattern: [4, 12] },
  { name: 'ハイハット', color: '#94ccff', pattern: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
];
const columns = Array.from({ length: 16 }, () => []);
const play = document.querySelector('#play');
const stop = document.querySelector('#stop');
const status = document.querySelector('#status');
const sequencer = document.querySelector('#sequencer');
const bpm = document.querySelector('#bpm');
const shuffle = document.querySelector('#shuffle');
const bpmValue = document.querySelector('#bpm-value');
const shuffleValue = document.querySelector('#shuffle-value');
const drumVolume = document.querySelector('#drum-volume');
const drumVolumeValue = document.querySelector('#drum-volume-value');

bpm.addEventListener('input', () => {
  bpmValue.textContent = bpm.value;
});
shuffle.addEventListener('input', () => {
  shuffleValue.textContent = `${shuffle.value}%`;
});

for (const track of tracks) {
  track.steps = Array.from({ length: 16 }, (_, step) => track.pattern.includes(step));
}
for (let beat = 0; beat < 4; beat++) {
  const group = document.createElement('div');
  group.className = 'beat';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', `${beat + 1}拍目`);
  for (let step = beat * 4; step < beat * 4 + 4; step++) {
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = String(step + 1).padStart(2, '0');
    columns[step].push(count);
    group.append(count);
  }
  for (const track of tracks) {
    const row = document.createElement('div');
    row.className = 'track';
    row.style.setProperty('--pad', track.color);
    const label = document.createElement('span');
    label.className = 'track-name';
    label.textContent = track.name;
    row.append(label);
    for (let step = beat * 4; step < beat * 4 + 4; step++) {
      const pad = document.createElement('button');
      pad.type = 'button';
      pad.className = 'step';
      pad.setAttribute('aria-label', `${track.name} ステップ ${step + 1}`);
      pad.setAttribute('aria-pressed', track.steps[step]);
      pad.addEventListener('click', () => {
        track.steps[step] = !track.steps[step];
        pad.setAttribute('aria-pressed', track.steps[step]);
      });
      columns[step].push(pad);
      row.append(pad);
    }
    group.append(row);
  }
  sequencer.append(group);
}

let audio, noise, session, currentStep = -1;

drumVolume.addEventListener('input', () => {
  drumVolumeValue.textContent = `${drumVolume.value}%`;
  if (session?.output) {
    session.output.gain.setTargetAtTime(drumVolume.valueAsNumber / 100, audio.currentTime, 0.008);
  }
});

function highlight(step) {
  if (currentStep === step) return;
  columns[currentStep]?.forEach(element => element.classList.remove('current'));
  columns[step]?.forEach(element => element.classList.add('current'));
  currentStep = step;
}

function tone(output, time, from, to, volume, duration) {
  const oscillator = audio.createOscillator();
  const envelope = audio.createGain();
  oscillator.frequency.setValueAtTime(from, time);
  oscillator.frequency.exponentialRampToValueAtTime(to, time + duration);
  envelope.gain.setValueAtTime(volume, time);
  envelope.gain.exponentialRampToValueAtTime(0.001, time + duration);
  oscillator.connect(envelope).connect(output);
  oscillator.start(time);
  oscillator.stop(time + duration);
}

function hit(output, voice, time) {
  if (voice === 0) {
    tone(output, time, 86, 53, 0.68, 0.22);
    tone(output, time, 168, 111, 0.10, 0.043);
    return;
  }
  const snare = voice === 1;
  const duration = snare ? 0.13 : 0.048;
  const source = audio.createBufferSource();
  const filter = audio.createBiquadFilter();
  const envelope = audio.createGain();
  source.buffer = noise;
  filter.type = 'bandpass';
  filter.frequency.value = snare ? 1750 : 5350;
  filter.Q.value = snare ? 0.8 : 1.45;
  envelope.gain.setValueAtTime(snare ? 0.61 : 0.31, time);
  envelope.gain.exponentialRampToValueAtTime(0.001, time + duration);
  source.connect(filter).connect(envelope).connect(output);
  source.start(time);
  source.stop(time + duration);
  if (snare) {
    tone(output, time, 182, 155, 0.23, 0.11);
    tone(output, time, 335, 286, 0.07, 0.064);
  }
}

function endPlayback(message = '停止中') {
  if (session) {
    clearInterval(session.timer);
    cancelAnimationFrame(session.frame);
    session.output?.disconnect();
    session = undefined;
  }
  highlight(-1);
  play.disabled = false;
  stop.disabled = true;
  status.textContent = message;
}

play.addEventListener('click', async () => {
  if (session) return;
  const run = { scheduled: [], step: 0 };
  session = run;
  play.disabled = true;
  stop.disabled = false;
  try {
    if (!audio) audio = new AudioContext();
    await audio.resume();
    if (session !== run) return;
    if (!noise) {
      noise = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
      const samples = noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    }
    run.output = audio.createGain();
    run.output.gain.value = drumVolume.valueAsNumber / 100;
    run.output.connect(audio.destination);
    const drumFilter = audio.createBiquadFilter();
    drumFilter.type = 'lowpass';
    drumFilter.frequency.value = 5400;
    drumFilter.Q.value = 0.3;
    drumFilter.connect(run.output);
    run.next = audio.currentTime + 0.035;
    function schedule() {
      const now = audio.currentTime;
      const pairDuration = 30 / bpm.valueAsNumber;
      const firstShare = 0.5 + shuffle.valueAsNumber / 600;
      while (run.next < now + 0.09) {
        const startsPair = run.step % 2 === 0;
        if (startsPair && run.next + pairDuration <= now) {
          const missedPairs = Math.floor((now - run.next) / pairDuration);
          run.next += missedPairs * pairDuration;
          run.step = (run.step + missedPairs * 2) % 16;
          continue;
        }
        if (run.next >= now) {
          tracks.forEach((track, voice) => {
            if (track.steps[run.step]) hit(drumFilter, voice, run.next);
          });
          run.scheduled.push({ step: run.step, time: run.next });
        }
        // Use the same timing for both steps so shuffle preserves the pair duration.
        if (startsPair) {
          run.pairEnd = run.next + pairDuration;
          run.next += pairDuration * firstShare;
        } else {
          run.next = run.pairEnd;
        }
        run.step = (run.step + 1) % 16;
      }
    }
    function showPosition() {
      while (run.scheduled[0]?.time <= audio.currentTime) {
        highlight(run.scheduled.shift().step);
      }
      run.frame = requestAnimationFrame(showPosition);
    }
    schedule();
    run.timer = setInterval(schedule, 25);
    showPosition();
    status.textContent = 'ループ再生中';
  } catch {
    if (session === run) endPlayback('音声を再生できませんでした');
  }
});

stop.addEventListener('click', () => endPlayback());

const keys = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const letters = 'CDEFGAB';
const naturalPitches = [0, 2, 4, 5, 7, 9, 11];
const romanDegrees = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const chordIntervals = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  7: [0, 4, 7, 10],
  'm7-5': [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
  aug: [0, 4, 8],
};
// Each entry describes a scale degree, a semitone alteration, and a chord suffix.
const chordGroups = {
  '#chord-buttons': [
    [1, 0, ''], [2, 0, 'm'], [3, 0, 'm'], [4, 0, ''], [5, 0, ''], [6, 0, 'm'], [7, 0, 'm7-5'],
  ],
  '#seventh-chords': [
    [1, 0, 'maj7'], [2, 0, 'm7'], [3, 0, 'm7'], [4, 0, 'maj7'], [5, 0, '7'], [6, 0, 'm7'], [7, 0, 'm7-5'],
  ],
  '#secondary-chords': [
    [6, 0, '7'], [7, 0, '7'], [1, 0, '7'], [2, 0, '7'], [3, 0, '7'], [4, 0, 'm'],
  ],
  '#borrowed-chords': [
    [1, 0, 'm'], [3, -1, ''], [6, -1, ''], [7, -1, ''],
  ],
  '#altered-chords': [
    [1, 1, 'dim7'], [2, 1, 'dim7'], [4, 1, 'dim7'], [5, 1, 'dim7'], [1, 0, 'aug'], [5, 0, 'aug'],
  ],
};
const keyName = document.querySelector('#key-name');
const chordStatus = document.querySelector('#chord-status');
let key = 0;
let chordOutput;
let chordRequest = 0;

function createPluckedString(output, midi) {
  const frequency = 440 * 2 ** ((midi - 69) / 12);
  const sampleRate = audio.sampleRate;
  const delay = Math.round(sampleRate / frequency - 0.5);
  const playbackRate = frequency * (delay + 0.5) / sampleRate;
  const buffer = audio.createBuffer(1, Math.ceil(sampleRate * playbackRate * 1.6), sampleRate);
  const samples = buffer.getChannelData(0);
  const string = new Float32Array(delay);
  for (let i = 0; i < delay; i++) {
    const phase = 2 * Math.PI * i / delay;
    const pick = (Math.random() - 0.5) * 0.65;
    string[i] = 0.4 * Math.sin(phase) + 0.22 * Math.sin(2 * phase) + pick;
  }
  // Averaging each trip around the delay line damps the upper harmonics.
  const feedback = Math.exp(-2.6 / frequency);
  const fadeIn = sampleRate * 0.001;
  const fadeOut = sampleRate * 0.08;
  let position = 0;
  let previous = string[delay - 1];
  for (let i = 0; i < samples.length; i++) {
    const value = string[position];
    string[position] = (value + previous) * 0.5 * feedback;
    previous = value;
    position = (position + 1) % delay;
    samples[i] = value * Math.min(1, i / fadeIn, (samples.length - 1 - i) / fadeOut);
  }
  const source = audio.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = playbackRate;
  source.connect(output);
  return source;
}

async function playChord(root, notes) {
  const request = ++chordRequest;
  try {
    if (!audio) audio = new AudioContext();
    if (audio.state !== 'running') await audio.resume();
    if (request !== chordRequest) return;
    if (chordOutput) {
      chordOutput.gain.setTargetAtTime(0, audio.currentTime, 0.008);
    }
    const output = audio.createGain();
    chordOutput = output;
    output.gain.value = 0.53 / notes.length;
    output.connect(audio.destination);
    const strings = notes.map(note => createPluckedString(output, root + note));
    strings.at(-1).onended = () => {
      output.disconnect();
      if (chordOutput === output) chordOutput = undefined;
    };
    const time = audio.currentTime;
    strings.forEach((string, index) => string.start(time + index * 0.018));
    chordStatus.hidden = true;
  } catch {
    if (request !== chordRequest) return;
    chordStatus.textContent = 'コードを再生できませんでした';
    chordStatus.hidden = false;
  }
}

const chordPads = [];
for (const [selector, chords] of Object.entries(chordGroups)) {
  const group = document.querySelector(selector);
  for (const [degree, alteration, suffix] of chords) {
    const offset = naturalPitches[degree - 1] + alteration;
    const button = document.createElement('button');
    button.type = 'button';
    const chordName = document.createElement('span');
    const degreeName = document.createElement('span');
    degreeName.className = 'chord-degree';
    const degreeAccidental = alteration < 0 ? 'b' : alteration > 0 ? '#' : '';
    degreeName.textContent = `(${romanDegrees[degree - 1]}${degreeAccidental}${suffix})`;
    button.append(chordName, degreeName);
    const trigger = () => playChord(48 + key + offset, chordIntervals[suffix]);
    button.addEventListener('pointerdown', event => {
      if (event.button === 0) trigger();
    });
    button.addEventListener('click', event => {
      // Some browsers require a completed tap to unlock audio on first use.
      if (event.detail === 0 || audio?.state !== 'running') trigger();
    });
    group.append(button);
    chordPads.push({ chordName, degree, offset, suffix });
  }
}

function showKey() {
  keyName.textContent = keys[key];
  const firstLetter = letters.indexOf(keys[key][0]);
  chordPads.forEach(({ chordName, degree, offset, suffix }) => {
    const letter = (firstLetter + degree - 1) % letters.length;
    const difference = (key + offset - naturalPitches[letter] + 18) % 12 - 6;
    const accidental = difference < 0 ? 'b'.repeat(-difference) : '#'.repeat(difference);
    chordName.textContent = letters[letter] + accidental + suffix;
  });
}

document.querySelector('#previous-key').addEventListener('click', () => {
  key = (key + keys.length - 1) % keys.length;
  showKey();
});
document.querySelector('#next-key').addEventListener('click', () => {
  key = (key + 1) % keys.length;
  showKey();
});
showKey();
