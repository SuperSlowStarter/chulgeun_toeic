"""content/*.json + LC 시간표 → public/data/t1.json, 그리고 sw.js 의 캐시 버전과 아이콘을 만든다.

사용: python -I tools/build_data.py   (build_audio.py 를 먼저 실행)
"""
import hashlib, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
C = ROOT / "content"
PUB = ROOT / "public"
load = lambda n: json.loads((C / n).read_text("utf-8"))

problems = []


def check_q(q, n_opts=4):
    if len(q["options"]) != n_opts:
        problems.append(f"{q['no']}: 보기 {len(q['options'])}개")
    if q["answer"] not in "ABCD"[:n_opts]:
        problems.append(f"{q['no']}: 정답 {q['answer']}")


tm = json.loads((PUB / "audio" / "t1" / "lc-timing.json").read_text("utf-8"))
mp3 = PUB / tm["file"]
audio_hash = hashlib.sha1(mp3.read_bytes()).hexdigest()[:10]
TALK_KO = {"telephone message": "전화 메시지", "announcement": "공지", "radio broadcast": "라디오 방송", "tour information": "투어 안내",
           "excerpt from a meeting": "회의 발췌", "advertisement": "광고", "introduction": "소개", "news report": "뉴스", "talk": "담화", "broadcast": "방송"}

sets = []
for it in load("p2.json"):
    check_q(it, 3)
    t = tm["p2"]["items"][str(it["no"])]
    sets.append({"part": 2, "nos": [it["no"]], **{k: it[k] for k in ("speakers", "prompt", "promptKo", "options", "optionsKo", "answer", "exp")}, "timing": t})
for part, name in ((3, "p3.json"), (4, "p4.json")):
    timings = {tuple(s["nos"]): s for s in tm[f"p{part}"]["sets"]}
    for st in load(name):
        for q in st["questions"]:
            check_q(q)
        t = timings[tuple(st["nos"])]
        rec = {"part": part, **st, "timing": t}
        if part == 4:
            rec["talkKo"] = TALK_KO.get(st.get("talkType", ""), "담화")
        sets.append(rec)
for q in load("p5.json"):
    check_q(q)
    sets.append({"part": 5, "nos": [q["no"]], "questions": [q]})
for st in load("p6.json"):
    for q in st["questions"]:
        check_q(q)
    sets.append({"part": 6, **st})
for st in load("p7s.json") + load("p7m.json"):
    for q in st["questions"]:
        check_q(q)
        # 휴대폰에서는 줄 위치가 달라지므로 "paragraph 2, line 3" → "paragraph 2"
        q["q"] = re.sub(r"(paragraph \d+), line \d+", r"\1", q["q"])
    sets.append({"part": 7, **st})

nos = [n for s in sets for n in s["nos"]]
if nos != list(range(7, 201)):
    problems.append(f"번호 순서가 7–200 이 아님 (개수 {len(nos)})")

data = {
    "id": "t1",
    "title": "실전 모의고사 1회",
    "audio": {"file": f"{tm['file']}?v={audio_hash}", "duration": tm["duration"], "mb": round(mp3.stat().st_size / 1e6, 1),
              "p2": {"start": tm["p2"]["start"], "end": tm["p2"]["end"]},
              "p3": {"start": tm["p3"]["start"], "end": tm["p3"]["end"]},
              "p4": {"start": tm["p4"]["start"], "end": tm["p4"]["end"]}},
    "sets": sets,
}
(PUB / "data").mkdir(exist_ok=True)
out = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
(PUB / "data" / "t1.json").write_text(out, "utf-8")

# 아이콘: 장미색 바탕에 칠해진 OMR 동그라미
icons = PUB / "icons"
icons.mkdir(exist_ok=True)
try:
    from PIL import Image, ImageDraw
    def icon(size, pad_ratio, name):
        im = Image.new("RGB", (size, size), (194, 51, 77))
        d = ImageDraw.Draw(im)
        r = size * (0.5 - pad_ratio)
        cx = cy = size / 2
        w = max(2, int(size * 0.045))
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 255, 255), width=w)
        ri = r - w * 2.2
        d.ellipse([cx - ri, cy - ri, cx + ri, cy + ri], fill=(44, 49, 56))
        im.save(icons / name)
    icon(192, 0.2, "icon-192.png"); icon(512, 0.2, "icon-512.png"); icon(180, 0.2, "apple-touch-icon.png"); icon(512, 0.3, "icon-maskable-512.png")
except ImportError:
    problems.append("Pillow 없음: 아이콘을 만들지 못함")

# 서비스 워커 버전: 앱 파일 내용이 바뀌면 새 캐시
h = hashlib.sha1()
for f in ("index.html", "app.css", "app.js", "manifest.webmanifest"):
    h.update((PUB / f).read_bytes())
h.update(out.encode())
sw = PUB / "sw.js"
sw.write_text(re.sub(r'const VERSION = "[^"]*";', f'const VERSION = "shell-{h.hexdigest()[:10]}";', sw.read_text("utf-8")), "utf-8")

print("세트", len(sets), "문항", len(nos), "음성", data["audio"]["mb"], "MB", f"{tm['duration']/60:.1f}분")
print("문제:", problems or "없음")
