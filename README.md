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
│  ├─ ltc-2026.js        2026년 근로소득 간이세액표 (소득세법 시행령 별표 2 원문)
│  ├─ app.js             화면 입력·표시
│  ├─ og-image.png       오픈그래프 이미지 1200×630
│  └─ icon-180.png       iOS 홈화면 아이콘 180×180
├─ tests/
│  ├─ salary.test.js     계산 엔진 단위 테스트 59건 (간이세액표 7,106칸 전수 대조 포함)
│  └─ fixtures/ltc-2026-cells.json  대조용 간이세액표 원문 값
├─ package.json          `npm test` = node tests/salary.test.js
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

`assets/calc.js` 상단의 `RATES_2026`, `RATES_2027` 객체를 고치면 화면 전체(계산기·연봉별 표·계산 기준 표)가 함께 바뀝니다.
소득세는 `assets/ltc-2026.js`의 간이세액표를 그대로 쓰므로, 매년 2월경 고시되는 새 별표 2가 나오면
국가법령정보센터 원문 PDF에서 표를 다시 옮겨 `ltc-2026.js`를 갱신해야 합니다(파일 형식 설명은 파일 머리말 참고).

1. `npm test`로 간이세액표 전수 대조·제보 사례·요율 테스트 통과 확인
2. `test/test_calc.py`의 기대값을 새 요율로 수정하고 테스트 통과 확인
3. `index.html`의 `기준일`(히어로 배지, 계산 기준 섹션)과 FAQ의 요율 문구 수정
4. `sitemap.xml`의 `lastmod` 수정

2027년 요율: 국민연금 5.0%, 건강보험 7.19% 동결, **장기요양보험료율 13.90%**(소득 대비 0.9994%,
2026. 10. 30. 장기요양위원회 의결)까지 반영했습니다. 고용보험은 2026년 요율로 가정합니다.
2027년 간이세액표는 아직 고시 전이라 2027년 계산에도 2026년 표를 씁니다.

## 계산 기준 요약 (2026-11-28 기준)

| 항목 | 값 |
| --- | --- |
| 국민연금 | 총 9.5%, 근로자 4.75%, 기준소득월액 41만~659만원(2026.7~2027.6) |
| 건강보험 | 총 7.19%, 근로자 3.595% |
| 장기요양 | 건강보험료의 13.14% (보수 대비 0.9448%) · 2027년 13.90% (0.9994%) |
| 고용보험 | 실업급여 1.8%, 근로자 0.9% |
| 소득세 | 국세청 근로소득 간이세액표(소득세법 시행령 별표 2, 개정 2026. 2. 27.) 그대로 |
| 자녀세액공제 | 8세 이상 20세 이하 1명 20,830원 / 2명 45,830원 / 3명 이상 45,830원 + 1명당 33,330원(월) |
| 지방소득세 | 소득세의 10% |
| 최저임금 | 2026년 시급 10,320원(월 2,156,880원) / 2027년 10,700원(월 2,236,300원) |

## 알려진 한계 (의도적으로 단순화한 부분)

- 소득세는 간이세액표를 그대로 적용합니다. 실제 명세서와의 차이는 주로 회사가 신고한 보수월액,
  상여·수당의 과세 시점, 건강보험료 정산(4월)에서 생깁니다.
- 원천징수 비율 선택(80%·100%·120%)은 반영하지 않고 표 금액(100%)으로 계산합니다.
- 퇴직금은 최근 3개월 임금이 일정하다고 가정합니다(월 임금 × 3 + 상여·연차수당의 3/12).
  평균임금이 통상임금보다 낮을 때의 통상임금 대체는 계산하지 않고 안내 문구로만 표시합니다.
- 연차 발생일수는 입사일 기준이며, 회계연도 기준으로 운영하는 회사는 직접 수정해야 합니다.
