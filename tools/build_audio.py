"""content/p2~p4.json 으로 LC 음성(public/audio/t1/lc.mp3)과 시간표(lc-timing.json)를 만든다.

실전처럼 Part 2 → 3 → 4 를 한 파일로 잇는다. 화면을 꺼도 끊기지 않게 하려는 것.
합성한 조각은 %LOCALAPPDATA%/toeic-mock/cache 에 저장해 두어 다시 빌드할 때 빠르다.

사용: python -I tools/build_audio.py [--only p2|p3|p4] [--preview]
"""
import hashlib, io, json, os, re, subprocess, sys, wave
from pathlib import Path

import numpy as np
from piper import PiperVoice, SynthesisConfig

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
OUT = ROOT / "public" / "audio" / "t1"
LOCAL = Path(os.environ["LOCALAPPDATA"]) / "toeic-mock"
VOICES = LOCAL / "voices"
CACHE = LOCAL / "cache"
SR = 22050

NARRATOR = "en_US-ryan-medium"
POOLS = {
    ("F", "US"): ["en_US-lessac-medium", "en_US-amy-medium", "en_US-hfc_female-medium"],
    ("M", "US"): ["en_US-joe-medium", "en_US-hfc_male-medium"],
    ("F", "GB"): ["en_GB-jenny_dioco-medium", "en_GB-alba-medium"],
    ("M", "GB"): ["en_GB-alan-medium", "en_GB-northern_english_male-medium"],
}
# 목소리마다 말 빠르기를 조금씩 맞춘다 (1.0 = 기본, 클수록 느림)
PACE = {"en_US-hfc_male-medium": 1.02, "en_GB-northern_english_male-medium": 0.98}

_loaded = {}


def voice(name):
    if name not in _loaded:
        v = PiperVoice.load(str(VOICES / f"{name}.onnx"))
        assert v.config.sample_rate == SR, (name, v.config.sample_rate)
        _loaded[name] = v
    return _loaded[name]


# ── 읽기 전처리 ──
DIG = {"0": "oh", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine"}


def spell(d):
    return " ".join(DIG[c] for c in d)


def normalize(t):
    t = t.replace("&", " and ").replace("—", ", ").replace("–", " to ")
    t = re.sub(r"\bext\.\s*", "extension ", t, flags=re.I)
    # 전화번호: 555-0142, 800-555-0142
    t = re.sub(r"\b(\d{3})-(\d{3})-(\d{4})\b", lambda m: f"{spell(m[1])}, {spell(m[2])}, {spell(m[3])}", t)
    t = re.sub(r"\b(\d{3})-(\d{4})\b", lambda m: f"{spell(m[1])}, {spell(m[2])}", t)

    # 금액: $45.50 → 45 dollars and 50 cents
    def money(m):
        n = m[1].replace(",", "")
        s = f"{n} dollar" + ("" if n == "1" else "s")
        if m[2] and m[2] != "00":
            s += f" and {int(m[2])} cents"
        return s
    t = re.sub(r"\$(\d[\d,]*)(?:\.(\d{2}))?", money, t)
    t = re.sub(r"(\d)\s?%", r"\1 percent", t)
    return re.sub(r"\s+", " ", t).strip()


def synth(name, text):
    text = normalize(text)
    scale = PACE.get(name, 1.0)
    key = hashlib.sha1(f"{name}|{scale}|{text}".encode()).hexdigest()
    f = CACHE / f"{key}.npy"
    if f.exists():
        return np.load(f)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        voice(name).synthesize_wav(text, w, syn_config=SynthesisConfig(length_scale=scale))
    buf.seek(0)
    with wave.open(buf, "rb") as r:
        a = np.frombuffer(r.readframes(r.getnframes()), dtype=np.int16)
    a = trim(a)
    CACHE.mkdir(parents=True, exist_ok=True)
    np.save(f, a)
    return a


def trim(a, thr=300):
    idx = np.nonzero(np.abs(a) > thr)[0]
    if not len(idx):
        return a
    s, e = max(0, idx[0] - int(0.03 * SR)), min(len(a), idx[-1] + int(0.08 * SR))
    return a[s:e]


class Track:
    def __init__(self):
        self.parts, self.n = [], 0

    @property
    def t(self):
        return round(self.n / SR, 2)

    def add(self, a):
        self.parts.append(a); self.n += len(a)

    def gap(self, sec):
        self.add(np.zeros(int(sec * SR), dtype=np.int16))

    def say(self, name, text, after=0.0):
        self.add(synth(name, text))
        if after:
            self.gap(after)


def cast(speakers, rot):
    """세트 안 화자마다 서로 다른 목소리를 배정한다. rot 로 세트마다 돌려 쓴다."""
    used, out = {}, {}
    for sp in speakers:
        pool = POOLS[(sp["gender"], sp["accent"])]
        k = (sp["gender"], sp["accent"])
        i = used.get(k, 0)
        out[sp["id"]] = pool[(rot + i) % len(pool)]
        used[k] = i + 1
    return out


N = NARRATOR
LETTERS = "ABCD"


def part2(tr, items, tl):
    tl["p2"] = {"start": tr.t, "items": {}}
    tr.say(N, "Part 2.", 0.8)
    tr.say(N, "Directions. You will hear a question or statement and three responses spoken in English. "
              "They will not be printed in your test book and will be spoken only one time. "
              "Select the best response to the question or statement and mark the letter A, B, or C on your answer sheet.", 1.5)
    for k, it in enumerate(items):
        v = cast(it["speakers"], k)
        a, b = it["speakers"][0]["id"], it["speakers"][1]["id"]
        s = tr.t
        tr.say(N, f"Number {it['no']}.", 0.7)
        tr.say(v[a], it["prompt"], 0.9)
        for i, o in enumerate(it["options"]):
            tr.say(v[b], f"{LETTERS[i]}.", 0.25)
            tr.say(v[b], o, 0.7 if i < 2 else 0)
        e = tr.t
        tr.gap(5)
        tl["p2"]["items"][it["no"]] = {"start": s, "spoken": e, "end": tr.t}
    tl["p2"]["end"] = tr.t


def intro(part, st):
    a, b = st["nos"][0], st["nos"][-1]
    g = st.get("graphic")
    if part == 3:
        what = "conversation"
        if len(st["speakers"]) >= 3:
            what += " with three speakers"
    else:
        what = st.get("talkType") or "talk"
    if g:
        what += f" and {g.get('kind') or 'graphic'}"
    return f"Questions {a} through {b} refer to the following {what}."


def part34(tr, part, sets, tl):
    key = f"p{part}"
    tl[key] = {"start": tr.t, "sets": []}
    if part == 3:
        tr.say(N, "Part 3.", 0.8)
        tr.say(N, "Directions. You will hear some conversations between two or more people. You will be asked to answer "
                  "three questions about what the speakers say in each conversation. Select the best response to each "
                  "question and mark the letter A, B, C, or D on your answer sheet. The conversations will not be printed "
                  "in your test book and will be spoken only one time.", 1.5)
    else:
        tr.say(N, "Part 4.", 0.8)
        tr.say(N, "Directions. You will hear some talks given by a single speaker. You will be asked to answer three "
                  "questions about what the speaker says in each talk. Select the best response to each question and mark "
                  "the letter A, B, C, or D on your answer sheet. The talks will not be printed in your test book and will "
                  "be spoken only one time.", 1.5)
    for k, st in enumerate(sets):
        v = cast(st["speakers"], k + part)
        rec = {"nos": st["nos"], "start": tr.t, "q": {}}
        tr.say(N, intro(part, st), 0.9)
        rec["talk"] = tr.t
        for i, ln in enumerate(st["lines"]):
            tr.say(v[ln["s"]], ln["t"], 0.45 if part == 3 else 0.6)
        tr.gap(1.0)
        rec["talkEnd"] = tr.t
        for q in st["questions"]:
            rec["q"][q["no"]] = tr.t
            tr.say(N, f"Number {q['no']}. {q['q']}", 0)
            tr.gap(8)
        rec["end"] = tr.t
        tl[key]["sets"].append(rec)
    tl[key]["end"] = tr.t


def main():
    only = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None
    tr, tl = Track(), {}
    parts = [("p2", lambda: part2(tr, json.loads((CONTENT / "p2.json").read_text("utf-8")), tl)),
             ("p3", lambda: part34(tr, 3, json.loads((CONTENT / "p3.json").read_text("utf-8")), tl)),
             ("p4", lambda: part34(tr, 4, json.loads((CONTENT / "p4.json").read_text("utf-8")), tl))]
    for name, fn in parts:
        if only and name != only:
            continue
        print("합성:", name, flush=True)
        fn()
        if name != "p4":
            tr.gap(2.0)
    pcm = np.concatenate(tr.parts)
    OUT.mkdir(parents=True, exist_ok=True)
    stem = f"lc-{only}" if only else "lc"
    wav = LOCAL / f"{stem}.wav"
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    mp3 = OUT / f"{stem}.mp3"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-af", "loudnorm=I=-18:TP=-2:LRA=11",
                    "-ar", "22050", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "48k", str(mp3)], check=True)
    tl["duration"] = tr.t
    tl["file"] = f"audio/t1/{stem}.mp3"
    (OUT / f"{stem}-timing.json").write_text(json.dumps(tl, ensure_ascii=False), "utf-8")
    print(f"완료: {mp3.name} {tr.t/60:.1f}분, {mp3.stat().st_size/1e6:.1f}MB")


if __name__ == "__main__":
    main()
