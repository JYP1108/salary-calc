# 생활 계산소 — 2026 실수령액·퇴직금·연차수당 계산기 (1호 웹툴)

의존성 없는 정적 사이트(HTML/CSS/JS)입니다. GitHub Pages·Cloudflare Pages·Netlify 어디에 올려도 그대로 동작하며,
빌드 단계가 없습니다. 모든 계산은 방문자 브라우저 안에서만 이루어지고 서버·DB·개인정보 수집이 없습니다.

## 파일 구성

```
webtool-calculator/
├─ index.html            메인 계산기 (실수령액 / 퇴직금 / 연차수당 탭 + 연봉별 표 + 계산 기준 + FAQ)
├─ about.html            소개·문의 (편집 원칙, 근거 자료 링크)
├─ privacy.html          개인정보처리방침 (AdSense 쿠키 고지 포함)
├─ robots.txt            검색 로봇 안내 + sitemap 위치
├─ sitemap.xml           사이트맵 (3개 URL)
├─ ads.txt               AdSense 게시자 ID 자리(주석 처리)
├─ assets/
│  ├─ style.css          전체 스타일 (모바일·PC 반응형, 다크 자동변환 없음)
│  ├─ calc.js            계산 엔진 (순수 함수, DOM 없음 → 그대로 테스트 가능)
│  ├─ app.js             화면 입력·표시
│  ├─ og-image.png       오픈그래프 이미지 1200×630
│  └─ icon-180.png       iOS 홈화면 아이콘 180×180
├─ scripts/make-assets.py  OG 이미지·아이콘 재생성 (Pillow + Noto Sans KR)
├─ test/test_calc.py     계산 엔진 검증 44건 (quickjs로 calc.js 실제 실행)
├─ test/validate.py      정적 검증 (HTML 구조·내부 링크·SEO 태그·외부 요청·개인정보 흔적)
├─ test/screenshot.py    로컬 렌더링 검수 (Playwright, PC·모바일 스크린샷 + 콘솔 오류 확인)
└─ review/               검수 스크린샷 (PC·모바일, 소개·개인정보 페이지)
```

## 로컬에서 보기

```bash
cd webtool-calculator
python3 -m http.server 8000     # http://localhost:8000
```

## 배포 상태

- **주소** — `https://jyp1108.github.io/salary-calc/` (GitHub Pages, `main` 브랜치 루트).
  canonical·OG·JSON-LD·`robots.txt`·`sitemap.xml`에 같은 주소가 들어 있습니다.
- **문의** — 이메일 대신 `https://github.com/JYP1108/salary-calc/issues` 링크를 씁니다(개인정보 노출 없음).
- **AdSense** — 아직 미신청입니다. `index.html` 상단 주석의 승인 스크립트(`ca-pub-XXXXXXXXXXXXXXXX`)와
  광고 슬롯(`data-ad-slot`), `ads.txt`의 게시자 ID를 발급 후 채워 넣습니다.

## 주소를 바꿀 때

```bash
grep -rl "jyp1108.github.io/salary-calc" . | xargs sed -i 's|https://jyp1108.github.io/salary-calc|https://새주소|g'
```

## 배포 (GitHub Pages)

`https://github.com/JYP1108/salary-calc` 에 `main` 브랜치 루트로 배포되어 있습니다.
저장소에는 배포 파일만 올라가고 검수용 `test/`·`review/`·`scripts/`는 `.gitignore`로 제외합니다.

수정 후 반영:

```bash
git add -A && git commit -m "..." && git push
```

배포 후 Google Search Console·네이버 서치어드바이저에 사이트를 등록하고 `sitemap.xml`을 제출합니다.

## 검증

```bash
python3 test/test_calc.py      # 계산 엔진 44건 (2026년 요율·세법·퇴직금 예제·연차수당)
python3 test/validate.py       # HTML 구조·링크·SEO·개인정보 흔적 정적 검증
python3 test/screenshot.py     # 로컬 렌더링 + 스크린샷 (review/ 폴더, PC·모바일)
```

`test/test_calc.py`는 quickjs로 `assets/calc.js`를 실제로 실행해 검증합니다(`pip install quickjs`).
고용노동부 퇴직금 계산 예제(재직 1,080일 · 평균임금 88,641원 → 퇴직금 7,868,433원)와 일치하는지,
2026년 4대보험료 공표 예시(월 300만원 → 291,520원)와 일치하는지 확인합니다.

## 요율이 바뀔 때 갱신할 곳

`assets/calc.js` 상단의 `RATES_2026`, `RATES_2027` 객체와 `TAX_BRACKETS`, `LIMITS`만 고치면
화면 전체(계산기·연봉별 표·계산 기준 표)가 함께 바뀝니다. 갱신 후에는:

1. `test/test_calc.py`의 기대값을 새 요율로 수정하고 테스트 통과 확인
2. `index.html`의 `기준일`(히어로 배지, 계산 기준 섹션)과 FAQ의 요율 문구 수정
3. `sitemap.xml`의 `lastmod` 수정

2027년에 실제로 반영할 때: 국민연금 5.0%는 확정, 건강보험 7.19% 동결 확정,
장기요양·고용보험 요율은 2026년 11월 기준 미확정입니다. 확정 고시 후 `RATES_2027`과
화면의 "예정" 표기를 실제 값으로 바꿔 주세요.

## 계산 기준 요약 (2026-11-15 기준)

| 항목 | 값 |
| --- | --- |
| 국민연금 | 총 9.5%, 근로자 4.75%, 기준소득월액 41만~659만원(2026.7~2027.6) |
| 건강보험 | 총 7.19%, 근로자 3.595% |
| 장기요양 | 건강보험료의 13.14% (보수 대비 0.9448%) |
| 고용보험 | 실업급여 1.8%, 근로자 0.9% |
| 소득세 | 6~45% 8구간, 근로소득공제·기본공제 150만원·근로소득세액공제·자녀세액공제(1명 25만/2명 55만)·표준세액공제 13만원 |
| 지방소득세 | 소득세의 10% |
| 최저임금 | 2026년 시급 10,320원(월 2,156,880원) / 2027년 10,700원(월 2,236,300원) |

## 알려진 한계 (의도적으로 단순화한 부분)

- 근로소득세는 간이세액표 방식을 근사합니다. 건강보험료 소득공제는 월 원천징수에 반영하지 않고
  연말정산 안내로 처리합니다(급여명세서와 월 1만~3만원 차이 가능).
- 퇴직금은 최근 3개월 임금이 일정하다고 가정합니다(월 임금 × 3 + 상여·연차수당의 3/12).
  평균임금이 통상임금보다 낮을 때의 통상임금 대체는 계산하지 않고 안내 문구로만 표시합니다.
- 연차 발생일수는 입사일 기준이며, 회계연도 기준으로 운영하는 회사는 직접 수정해야 합니다.
