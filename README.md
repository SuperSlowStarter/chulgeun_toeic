# 출근길 모의토익

지하철에서 휴대폰으로 푸는 토익 L&R 실전 모의고사입니다. 문제는 모두 새로 창작했고, Part 1(사진 묘사)은 빠져 있습니다.

- **실전 전체 / LC만 / RC만**: LC는 Part 2–4를 한 파일로 이어 재생해서 화면을 꺼도 끊기지 않습니다. RC는 75분 타이머가 돌아갑니다.
- **이어서 풀기**: 고른 답, LC 재생 위치, RC 남은 시간이 휴대폰에 저장됩니다. LC는 듣던 세트의 처음부터 다시 나옵니다.
- **오프라인**: 홈에서 "LC 음성 저장하기"를 한 번 누르면 인터넷 없이도 풀 수 있습니다.
- **채점과 해설**: 예상 점수(비공식 근사치), 파트별 정답률, 틀린 문제 해설, LC 스크립트와 해석, 다시 듣기.
- **파트별 연습**: 세트 단위로 풀고 바로 채점하며, LC는 0.8×·1×·1.2× 속도로 들을 수 있습니다.

## 구조

| 경로 | 내용 |
|---|---|
| `public/` | 배포되는 사이트 (Vercel 출력 폴더) |
| `content/*.json` | 파트별 문제 원본, `content/SPEC.md`는 형식 설명 |
| `tools/build_audio.py` | Piper로 LC 음성(`public/audio/t1/lc.mp3`)과 시간표를 만듭니다 |
| `tools/build_data.py` | 문제와 시간표를 합쳐 `public/data/t1.json`을 만들고, 오프라인 캐시 버전을 올립니다 |

## 다시 만들기

```
pip install piper-tts
python -m piper.download_voices en_US-lessac-medium en_US-amy-medium en_US-hfc_female-medium en_US-ryan-medium en_US-joe-medium en_US-hfc_male-medium en_GB-jenny_dioco-medium en_GB-alba-medium en_GB-alan-medium en_GB-northern_english_male-medium
python -I tools/build_audio.py
python -I tools/build_data.py
```

음성 모델은 `%LOCALAPPDATA%\toeic-mock\voices`에 둡니다. 저장소에는 올리지 않습니다.

## 배포

Vercel에서 저장소를 Import하면 `vercel.json`에 따라 `public/`이 배포됩니다.
