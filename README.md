# Push & Pull — 개인용 헬스 트레이닝 PWA

로그인 없이 쓰는 모바일 웹앱(PWA). 빌드 단계 없음: 정적 파일 그대로 배포/실행.

```bash
npm run serve        # http://localhost:4173  (아무 정적 서버나 가능, 예: python3 -m http.server)
npm test             # 순수 로직 단위 테스트 (19)
npm run e2e          # Playwright로 iPhone 뷰포트에서 실제 앱 조작 (88 체크, `npm i -D playwright` 필요)
npm run robust       # 두 탭 동기화, 저장소 차단/용량 초과, 빈 데이터 등 예외 상황 (27 체크)
npm run verify       # 위 세 가지 전부
```
iPhone: Safari에서 열기 → 공유 → **홈 화면에 추가**. 오프라인 동작(Service Worker).

## 구조
| 파일 | 역할 |
|---|---|
| `js/logic.js` | **순수 함수**(DOM/저장소 없음): 추정 1RM, 볼륨, 점진적 과부하 제안, 시간 제한 조정, 플레이트 계산, 주간 근육 세트, CSV, 백업 검증 |
| `js/store.js` | 단일 JSON 문서 저장(localStorage), 불러오기/마이그레이션, 백업·복원, **타임스탬프 기반 휴식 타이머** |
| `js/data.js` | 기본 운동 41종(자세 가이드·대체 운동 포함)과 Push/Pull/Legs/Full Body 루틴 |
| `js/app.js` | UI 5탭 + 운동 화면 + 시트(모달) + 이벤트 |
| `sw.js`, `manifest.webmanifest` | PWA / 오프라인 |

## 데이터 모델 (schema v1)
```
S = { schema, settings, meta,
  exercises: { id -> {name, ko, primary[], secondary[], equipment, mode, sets, repMin, repMax, rir, rest, inc,
                      setup, form, breath, tempo, mistakes, alts[], custom} },
  routines:  { id -> {name, desc, items:[{id, exerciseId, sets, repMin, repMax, rir, rest}], updatedAt} },
  routineOrder: [id],
  sessions: [{ id, routineId, routineName, startedAt, endedAt, status:'active'|'done',
               pre:{condition,fatigue}, post:{satisfaction,note}, pain:[{part,level,note}], timeLimit,
               exercises:[{ id, exerciseId, snap:{name,ko,mode,primary,secondary,repMin,repMax,rir,rest,inc},
                            skipped, formBreak, note,
                            sets:[{id, type:'work'|'warmup', weight, reps, rir, done, doneAt, pr}] }] }],
  activeId, timer:{endAt, duration, paused, remaining, label, fired} }
```
* **과거 기록 불변**: 세션은 운동의 `snap`(이름·중량 기준·목표)을 복사해 저장 → 루틴/운동을 수정·삭제해도 기록은 그대로.
* **중량 기준(`mode`)**: `perHand`(덤벨 개당, 볼륨 ×2) · `total`(바벨 총중량) · `machine`(머신 표시값) · `bodyweight`(+추가 중량).
* 모든 항목이 UUID + `updatedAt`을 가지므로 추후 클라우드 동기화(id 단위 병합)·AI 기능 추가가 쉽습니다.

## 배포 (GitHub Pages)
`main`에 푸시하면 `.github/workflows/pages.yml`이 단위 테스트 후 앱 파일만 배포합니다. **저장소 Settings → Pages → Source를 `GitHub Actions`로 한 번 설정**해야 합니다. 배포 후 Safari에서 열어 홈 화면에 추가하세요. 코드를 바꾸면 `sw.js`의 `VERSION`을 올려야 설치된 앱이 새 파일을 받습니다.

## 실기기 점검
`docs/DEVICE-TEST.md` — 잠금 화면 타이머, 설치, 오프라인 등 자동 테스트로 확인할 수 없는 22개 항목.

## 점진적 과부하 규칙 (`logic.suggest`)
같은 `exerciseId` **그리고** 같은 `mode`의 직전 완료 기록만 사용(다른 운동·기구 간 비교 없음). 운동마다 방식 선택(운동 정보 편집): **엄격**(기본: 모든 세트 상한) · **평균**(첫 세트 상한 + 평균 ≥ 상한−1) · **수동**(제안 없음).
1. 모든 작업 세트가 반복 상한 달성 + RIR ≥ 목표−1 + "자세 흔들림" 미체크 → **증량 제안**(+운동별 증량 단위)
2. 상한 달성했지만 RIR이 낮거나 자세 흔들림 → 유지
3. 하한 미달 → 유지, 2회 연속 미달 → **감량 제안**
4. 기록 없음 → 제안 없음, **중량을 임의로 채우지 않음**. 제안은 [적용]을 눌러야만 반영(미완료 세트만).

## 알려진 제한 (앱 안에도 표시됨)
* **백그라운드 알림 불가**: 웹앱은 화면 잠금/앱 전환 중 소리·진동을 낼 수 없음. 복귀 시 실제 경과 시간으로 남은 시간을 정확히 복원하고, 이미 끝났다면 `+경과시간`을 표시. 운동 중 Wake Lock으로 화면 꺼짐을 줄임. iPhone Safari는 웹 진동 미지원.
* 데이터는 **이 브라우저에만** 저장(Safari는 오래 미사용 시 삭제 가능) → 홈 화면에 추가 + 주기적 JSON 백업 권장.

## 구현 범위
* **Phase 1 완료**: 루틴 CRUD/순서/교체/커스텀 운동, 실시간 세트 기록(지난 기록 기본값, 워밍업, 건너뛰기, 순서 변경, 완료 취소), 휴식 타이머, 자세 가이드, 세션 복구, JSON/CSV, 오프라인.
* **Phase 2 일부 포함**: 성장 그래프(1·3·6개월/전체), 증량 제안, 대체 운동, 컨디션·만족도·통증 기록, PR 표시, 플레이트 계산기, 캘린더, 시간 제한 루틴 조정.
* **회복 제안**(`logic.recoveryAdvice`): 3일 연속 운동 → 휴식, 피로/컨디션 불량 반복·6주 연속·만족도 저조 → 디로드. Today 화면에 힌트로만 표시.
* **무게 이어받기**: 세트를 완료하면 아직 안 한 뒤 세트들이 **바로 전 세트 무게**로 바뀜(1세트 20 → 2세트 25 → 3세트는 25에서 시작). 미리 직접 무게를 바꿔 둔 세트는 건드리지 않음.
* **보유 덤벨**(설정): 덤벨 운동은 보유 무게 목록을 스크롤해서 선택, ±도 목록을 따라 이동, 증량 제안도 다음 보유 덤벨로 안내.
* 세트별 휴식 조정(−15/+15), 슈퍼세트(운동 순서에서 ↔로 묶기).
* Phase 3(고급 분석·개인화 추천·클라우드)는 미구현 — 데이터 구조만 대비.
