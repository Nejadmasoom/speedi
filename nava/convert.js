// Turns a user's own audio or MIDI file into NAVA notation, entirely inside the browser: nothing is uploaded.
// Audio is transcribed with Spotify's Basic Pitch model (Apache-2.0, see vendor/NOTICE.txt), loaded only on demand.
const Convert = (() => {
  'use strict';

  const SR = 22050;              // Basic Pitch's input rate
  const MAX_SEC = 150;           // longer files are cut, transcription time grows with length
  const MAX_MELODY = 600;
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const NATURAL = [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1];

  let libLoad = null;
  function loadLib() {
    if (window.BasicPitchLib) return Promise.resolve(window.BasicPitchLib);
    if (libLoad) return libLoad;
    libLoad = new Promise((res, rej) => {
      const s = document.createElement('script');
      // the single-file build (nava-standalone.html) serves its bundled copy through window.navaAssetURL
      s.src = window.navaAssetURL ? window.navaAssetURL('vendor/basic-pitch.min.js') : 'vendor/basic-pitch.min.js';
      s.onload = () => window.BasicPitchLib ? res(window.BasicPitchLib) : rej(new Error('lib'));
      s.onerror = () => { libLoad = null; s.remove(); rej(new Error('lib')); };
      document.head.appendChild(s);
    });
    return libLoad;
  }

  // midi (may be x.5 for a quarter tone) -> "Ek4" style name the song parser understands
  function noteName(m) {
    if (m % 1) {
      const up = Math.round(m + 0.5), dn = up - 1;
      if (NATURAL[up % 12]) return NAMES[up % 12] + 'k' + (Math.floor(up / 12) - 1);
      return NAMES[dn % 12] + 's' + (Math.floor(dn / 12) - 1);
    }
    return NAMES[m % 12] + (Math.floor(m / 12) - 1);
  }

  function decode(file) {
    return file.arrayBuffer().then(ab => new Promise((res, rej) => {
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const oc = new OAC(1, 1, SR); // decodeAudioData resamples to the context's rate
      const p = oc.decodeAudioData(ab, res, rej);
      if (p && p.then) p.then(res, rej);
    }));
  }

  async function fromAudio(file, opts = {}, onProgress = () => {}) {
    onProgress('load', 0);
    const lib = await loadLib();
    onProgress('decode', 0);
    let buf;
    try { buf = await decode(file); } catch (e) { throw new Error('decode'); }
    const n = Math.min(buf.length, MAX_SEC * SR);
    const mono = new Float32Array(n);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) mono[i] += d[i] / buf.numberOfChannels;
    }
    const bp = new lib.BasicPitch('vendor/basic-pitch-model/model.json');
    const frames = [], onsets = [], contours = [];
    await bp.evaluateModel(mono,
      (f, o, c) => { frames.push(...f); onsets.push(...o); contours.push(...c); },
      p => onProgress('listen', p));
    const events = lib.noteFramesToTime(lib.addPitchBendsToNoteEvents(contours,
      lib.outputToNotesPoly(frames, onsets, 0.5, 0.3, 11)));
    const median = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
    let raw = events.filter(e => e.durationSeconds >= 0.07 && e.amplitude >= 0.2);
    // overtones show up as quieter notes a harmonic above a louder one that is still ringing
    const HARM = [12, 19, 24, 28, 31, 34, 36];
    raw = raw.filter(e => !raw.some(o => o !== e && o.amplitude > e.amplitude * 0.9 &&
      e.startTimeSeconds > o.startTimeSeconds - 0.08 && e.startTimeSeconds < o.startTimeSeconds + o.durationSeconds && HARM.some(h => Math.abs(e.pitchMidi - o.pitchMidi - h) <= 1)));
    // bends are in thirds of a semitone; the recording's own tuning offset is removed first
    const bend = e => e.pitchBends && e.pitchBends.length ? median(e.pitchBends) : 0;
    const tuning = raw.length ? median(raw.map(bend)) : 0;
    const notes = raw.map(e => {
      let m = e.pitchMidi;
      if (opts.quarterTones) {
        const b = bend(e) - tuning;
        if (b <= -1 && b >= -2) m -= 0.5; else if (b >= 1 && b <= 2) m += 0.5;
      }
      return { t: e.startTimeSeconds, d: e.durationSeconds, m, a: e.amplitude };
    });
    if (!notes.length) throw new Error('empty');
    return Object.assign(toSong(notes), { cut: buf.length > n });
  }

  async function fromMidi(file) {
    const lib = await loadLib();
    let midi;
    try { midi = new lib.Midi(await file.arrayBuffer()); } catch (e) { throw new Error('decode'); }
    const notes = [];
    for (const tr of midi.tracks) {
      if (tr.channel === 9 || (tr.instrument && tr.instrument.percussion)) continue;
      for (const nt of tr.notes) notes.push({ t: nt.time, d: nt.duration, m: nt.midi, a: nt.velocity });
    }
    if (!notes.length) throw new Error('empty');
    const bpm = midi.header.tempos.length ? midi.header.tempos[0].bpm : 120;
    return toSong(notes, 60 / bpm);
  }

  // Most common gap between onsets, refined by averaging the gaps close to it.
  function pulse(onsets) {
    const iois = [];
    for (let i = 1; i < onsets.length; i++) { const d = onsets[i] - onsets[i - 1]; if (d >= 0.08 && d <= 1.2) iois.push(d); }
    if (iois.length < 3) return 0.4;
    const hist = new Float32Array(121);
    for (const d of iois) for (let k = -2; k <= 2; k++) {
      const b = Math.round(d * 100) + k;
      if (b >= 0 && b < hist.length) hist[b] += 1 - Math.abs(k) * 0.3;
    }
    let best = 8;
    for (let b = 8; b < hist.length; b++) if (hist[b] > hist[best]) best = b;
    const near = iois.filter(d => Math.abs(d - best / 100) < best / 100 * 0.2);
    return near.reduce((a, d) => a + d, 0) / near.length;
  }

  // notes: [{t, d, m, a}] in seconds. quarterSec (known for MIDI) makes the beat a power-of-two fraction of it.
  function toSong(notes, quarterSec) {
    notes.sort((x, y) => x.t - y.t || y.m - x.m);
    // chords: onsets closer than 50 ms belong together
    const groups = [];
    for (const nt of notes) {
      const g = groups[groups.length - 1];
      if (g && nt.t - g.t < 0.05) g.notes.push(nt); else groups.push({ t: nt.t, notes: [nt] });
    }
    // one notation beat = one tile row: the most common note length, kept between ~0.28 and 0.62 s
    let beatSec = pulse(groups.map(g => g.t));
    if (quarterSec) beatSec = quarterSec * Math.pow(2, Math.round(Math.log2(beatSec / quarterSec)));
    if (beatSec < 0.28) beatSec *= 2;
    while (beatSec > 0.62) beatSec /= 2;
    const step = beatSec / 2; // grid: half a beat, the shortest tile
    // quantise each gap rather than absolute times, so a slightly wrong tempo never drifts
    let s = 0;
    const qg = [];
    for (let i = 0; i < groups.length; i++) {
      if (i) {
        const k = Math.round((groups[i].t - groups[i - 1].t) / step);
        if (k <= 0) { qg[qg.length - 1].notes.push(...groups[i].notes); continue; }
        s += k;
      }
      qg.push({ s, notes: groups[i].notes });
    }
    // melody = the top voice; groups far below the usual melody range are accompaniment only
    const tops = qg.map(g => Math.max(...g.notes.map(n => n.m))).sort((a, b) => a - b);
    const midTop = tops[tops.length >> 1];
    const mel = [], acc = [];
    for (const g of qg) {
      const byPitch = g.notes.slice().sort((a, b) => b.m - a.m);
      const top = byPitch[0];
      let rest = byPitch;
      if (top.m >= midTop - 10) {
        mel.push({ s: g.s, m: [top.m], len: Math.max(1, Math.round(top.d / step)) });
        rest = byPitch.slice(1).filter(n => n.m < top.m - 0.5);
      }
      const low = [...new Set(rest.map(n => n.m))].sort((a, b) => a - b).slice(0, 3);
      if (low.length) acc.push({ s: g.s, m: low, len: Math.max(1, Math.round(Math.max(...rest.map(n => n.d)) / step)) });
    }
    if (!mel.length) throw new Error('empty');
    if (mel.length > MAX_MELODY) {
      const endS = mel[MAX_MELODY].s;
      mel.length = MAX_MELODY;
      while (acc.length && acc[acc.length - 1].s >= endS) acc.pop();
    }
    const last = l => l.length ? l[l.length - 1].s + l[l.length - 1].len : 0;
    const origin = Math.min(mel[0].s, acc.length ? acc[0].s : Infinity);
    const end = Math.max(last(mel), last(acc));
    const melody = line(mel, origin, end), accomp = acc.length ? line(acc, origin, end) : '';
    return {
      melody, accomp,
      speed: Math.min(6, Math.max(1.5, Math.round(10 / beatSec) / 10)),
      bpm: Math.round(60 / beatSec),
      count: mel.length,
    };
  }

  // One line of notation from grid events; gaps become rests, and a bar line goes every 8 beats.
  function line(evs, origin, end) {
    const out = [];
    const fmt = steps => { const b = steps / 2; return b === 1 ? '' : ':' + (b === 0.5 ? '1/2' : b); };
    let at = origin;
    const put = (tok, st, len) => {
      if (out.length && (st - origin) % 16 === 0) out.push('|');
      out.push(tok + fmt(len));
    };
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      if (e.s > at) put('r', at, e.s - at);
      const next = i + 1 < evs.length ? evs[i + 1].s : end;
      // a note sounds until the next one, unless it clearly stopped earlier (then the rest is a rest)
      const len = next - e.s > e.len + 2 ? e.len : next - e.s;
      put(e.m.map(noteName).join('+'), e.s, len);
      at = e.s + len;
    }
    if (end > at) put('r', at, end - at);
    return out.join(' ');
  }

  return { fromAudio, fromMidi, toSong, noteName };
})();
