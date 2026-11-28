// Built-in exercise library and default routines. Everything here is copied into user data
// on first launch and is then fully editable.
const DEF = {
  push: { breath: '내릴 때 들이마시고, 밀어 올릴 때 내쉽니다.', tempo: '내리기 2~3초 · 올리기 1~2초 · 반동 없이' },
  pull: { breath: '당길 때 내쉬고, 돌아올 때 들이마십니다.', tempo: '당기기 1~2초 · 이완 2~3초 · 반동 없이' },
  legs: { breath: '내려갈 때 들이마시고, 올라올 때 내쉽니다.', tempo: '내리기 2~3초 · 올리기 1~2초' },
  iso: { breath: '힘을 주는 구간에서 내쉬고, 돌아올 때 들이마십니다.', tempo: '올리기 1~2초 · 내리기 2~3초 · 정점에서 잠깐 멈춤' },
};
const X = (id, ko, name, o) => {
  const d = DEF[o.kind || 'push'];
  return {
    id, name, ko, primary: o.p, secondary: o.s || [], equipment: o.eq, mode: o.mode,
    sets: o.n, repMin: o.r[0], repMax: o.r[1], rir: o.rir ?? 2, rest: o.rest, inc: o.inc,
    setup: o.setup, form: o.form, breath: o.breath || d.breath, tempo: o.tempo || d.tempo, mistakes: o.mis,
    alts: o.alts || [], custom: false,
  };
};

export const DEFAULT_EXERCISES = [
  // ---------- Push ----------
  X('incline-db-press', '인클라인 덤벨 프레스', 'Incline Dumbbell Press', { p: ['가슴'], s: ['어깨', '삼두'], eq: '덤벨', mode: 'perHand', n: 4, r: [8, 10], rest: 120, inc: 2, rir: 2,
    setup: '벤치 각도를 30°(낮은 인클라인)로 세팅. 덤벨을 무릎 위에 올려 앉은 뒤 킥하듯 가슴 옆으로 올립니다.',
    form: '견갑을 모아 내리고 가슴을 살짝 펴세요. 팔꿈치는 몸통에서 약 45~60° 벌립니다. 손목은 팔뚝 위에 수직으로 유지하고, 위에서 덤벨이 가슴 위에 오도록 모읍니다.',
    mis: '벤치 각도를 너무 높여 어깨 운동이 됨 · 팔꿈치를 90°로 과하게 벌림 · 바닥 구간에서 반동 · 엉덩이가 들림',
    alts: ['machine-incline-press', 'flat-db-press', 'push-up'] }),
  X('machine-chest-press', '머신 체스트 프레스', 'Machine Chest Press', { p: ['가슴'], s: ['어깨', '삼두'], eq: '머신', mode: 'machine', n: 3, r: [10, 12], rest: 90, inc: 5,
    setup: '손잡이가 가슴 중간 높이에 오도록 시트 높이 조절. 등을 패드에 붙이고 어깨를 내립니다.',
    form: '견갑을 뒤로 당겨 고정하고 가슴으로 밀어냅니다. 팔을 끝까지 잠그지 말고 살짝 여유를 남깁니다.',
    mis: '어깨가 말려 올라감 · 등이 패드에서 떨어짐 · 팔꿈치 완전 잠금 · 너무 빠른 복귀',
    alts: ['flat-db-press', 'pec-deck', 'push-up'] }),
  X('cable-fly', '케이블 플라이', 'Cable Fly', { p: ['가슴'], s: ['어깨'], eq: '케이블', mode: 'machine', n: 3, r: [12, 15], rest: 60, inc: 2.5, kind: 'iso',
    setup: '풀리를 가슴~어깨 높이로 맞추고 한 발 앞으로 내딛어 안정적인 자세를 만듭니다.',
    form: '팔꿈치를 살짝 굽힌 각도를 유지한 채 큰 원을 그리듯 가슴 앞으로 모읍니다. 모을 때 가슴 수축을 느끼고 천천히 벌립니다.',
    mis: '팔을 굽혔다 폈다 하며 프레스처럼 사용 · 어깨가 앞으로 말림 · 몸통 반동',
    alts: ['pec-deck', 'push-up'] }),
  X('shoulder-press', '숄더 프레스', 'Shoulder Press', { p: ['어깨'], s: ['삼두'], eq: '덤벨', mode: 'perHand', n: 3, r: [8, 12], rest: 90, inc: 2,
    setup: '벤치 등받이를 70~80°로 세팅. 덤벨을 귀 높이에서 시작합니다.',
    form: '갈비뼈를 닫고 복부에 힘을 준 채 머리 위로 밀어 올립니다. 팔꿈치는 몸통 앞 30~45° 방향에 둡니다.',
    mis: '허리를 과하게 꺾음 · 덤벨을 너무 뒤로 보냄 · 어깨를 귀 쪽으로 으쓱함',
    alts: ['machine-shoulder-press', 'cable-lateral-raise'] }),
  X('lateral-raise', '레터럴 레이즈', 'Lateral Raise', { p: ['어깨'], eq: '덤벨', mode: 'perHand', n: 4, r: [12, 15], rest: 60, inc: 1, kind: 'iso', rir: 1,
    setup: '가벼운 덤벨을 몸 옆에 두고 상체를 약간 앞으로 기울입니다.',
    form: '팔꿈치를 살짝 굽히고 팔꿈치를 이끌 듯 어깨 높이까지 올립니다. 새끼손가락이 엄지보다 살짝 높게.',
    mis: '몸을 흔들어 반동 사용 · 승모근으로 으쓱 · 어깨 위로 과하게 올림',
    alts: ['cable-lateral-raise'] }),
  X('rope-pushdown', '로프 푸시다운', 'Rope Pushdown', { p: ['삼두'], eq: '케이블', mode: 'machine', n: 3, r: [10, 15], rest: 60, inc: 2.5, kind: 'iso',
    setup: '풀리를 가장 높은 위치에 두고 로프를 잡습니다. 상체를 약간 앞으로 숙입니다.',
    form: '팔꿈치를 옆구리에 고정하고 아래로 누른 뒤 끝에서 로프를 양옆으로 벌려 수축합니다.',
    mis: '팔꿈치가 앞뒤로 움직임 · 상체로 체중을 실어 누름 · 팔을 끝까지 올리지 않음',
    alts: ['straight-bar-pushdown'] }),
  X('overhead-cable-ext', '오버헤드 케이블 익스텐션', 'Overhead Cable Extension', { p: ['삼두'], eq: '케이블', mode: 'machine', n: 3, r: [12, 15], rest: 60, inc: 2.5, kind: 'iso',
    setup: '풀리를 낮은 위치에 두고 등을 돌려 로프를 머리 뒤에서 잡습니다. 한 발을 앞으로.',
    form: '팔꿈치를 귀 옆에 고정하고 앞쪽 위로 펴냅니다. 늘어나는 구간에서 삼두 스트레치를 충분히 느낍니다.',
    mis: '팔꿈치가 벌어짐 · 허리 과신전 · 반동으로 던지듯 폄',
    alts: ['db-overhead-ext', 'rope-pushdown'] }),
  // Push alternatives
  X('machine-incline-press', '머신 인클라인 프레스', 'Machine Incline Press', { p: ['가슴'], s: ['어깨', '삼두'], eq: '머신', mode: 'machine', n: 3, r: [8, 12], rest: 90, inc: 5, setup: '손잡이가 윗가슴 높이에 오도록 시트 조절.', form: '견갑 고정 후 윗가슴 방향으로 밀어냅니다.', mis: '어깨 말림 · 반동' }),
  X('flat-db-press', '플랫 덤벨 프레스', 'Flat Dumbbell Press', { p: ['가슴'], s: ['어깨', '삼두'], eq: '덤벨', mode: 'perHand', n: 3, r: [8, 12], rest: 90, inc: 2, setup: '평평한 벤치에 눕고 견갑을 모아 고정.', form: '팔꿈치 45~60°, 가슴 중간까지 내렸다 밀어 올립니다.', mis: '팔꿈치 과하게 벌림 · 엉덩이 들림' }),
  X('pec-deck', '펙덱 플라이', 'Pec Deck Fly', { p: ['가슴'], eq: '머신', mode: 'machine', n: 3, r: [12, 15], rest: 60, inc: 2.5, kind: 'iso', setup: '팔꿈치 높이가 어깨 높이가 되게 시트 조절.', form: '가슴을 펴고 팔꿈치로 밀듯 모읍니다.', mis: '어깨 말림 · 손으로만 당김' }),
  X('push-up', '푸시업', 'Push-up', { p: ['가슴'], s: ['어깨', '삼두'], eq: '맨몸', mode: 'bodyweight', n: 3, r: [10, 20], rest: 60, inc: 2.5, rir: 2, setup: '손을 어깨너비보다 약간 넓게, 몸을 일직선으로.', form: '코어를 조이고 가슴이 바닥에 닿기 직전까지 내립니다.', mis: '허리 처짐 · 목 앞으로 빼기' }),
  X('machine-shoulder-press', '머신 숄더 프레스', 'Machine Shoulder Press', { p: ['어깨'], s: ['삼두'], eq: '머신', mode: 'machine', n: 3, r: [8, 12], rest: 90, inc: 5, setup: '손잡이가 어깨 높이에 오도록 시트 조절.', form: '등을 패드에 붙이고 위로 밀어 올립니다.', mis: '허리 꺾임 · 어깨 으쓱' }),
  X('cable-lateral-raise', '케이블 레터럴 레이즈', 'Cable Lateral Raise', { p: ['어깨'], eq: '케이블', mode: 'machine', n: 3, r: [12, 15], rest: 60, inc: 1.25, kind: 'iso', setup: '풀리를 가장 낮게, 먼 손으로 핸들을 잡습니다.', form: '팔꿈치를 이끌며 어깨 높이까지 올립니다.', mis: '몸통 반동 · 으쓱' }),
  X('straight-bar-pushdown', '스트레이트 바 푸시다운', 'Straight-Bar Pushdown', { p: ['삼두'], eq: '케이블', mode: 'machine', n: 3, r: [10, 15], rest: 60, inc: 2.5, kind: 'iso', setup: '풀리 높게, 바를 어깨너비로 잡습니다.', form: '팔꿈치 고정, 끝까지 눌러 수축.', mis: '팔꿈치 움직임 · 체중 실어 누름' }),
  X('db-overhead-ext', '덤벨 오버헤드 익스텐션', 'Dumbbell Overhead Extension', { p: ['삼두'], eq: '덤벨', mode: 'total', n: 3, r: [10, 15], rest: 60, inc: 2, kind: 'iso', setup: '덤벨 하나를 양손으로 받쳐 머리 위로.', form: '팔꿈치를 모은 채 머리 뒤로 내리고 폅니다.', mis: '팔꿈치 벌어짐 · 허리 꺾임' }),
  // ---------- Pull ----------
  X('lat-pulldown', '랫 풀다운', 'Lat Pulldown', { p: ['등'], s: ['이두', '후면삼각근'], eq: '케이블', mode: 'machine', n: 4, r: [8, 12], rest: 90, inc: 2.5, kind: 'pull',
    setup: '허벅지 패드를 단단히 고정하고 바를 어깨너비보다 약간 넓게 잡습니다.',
    form: '가슴을 펴고 어깨를 내린 뒤 팔꿈치를 바닥으로 끌어내리듯 쇄골 아래까지 당깁니다.',
    mis: '상체를 뒤로 젖혀 반동 사용 · 목 뒤로 당김 · 팔로만 당김 · 어깨 으쓱',
    alts: ['assisted-pull-up', 'pull-up', 'machine-row'] }),
  X('chest-supported-row', '체스트 서포티드 로우', 'Chest-Supported Row', { p: ['등'], s: ['후면삼각근', '이두'], eq: '머신', mode: 'machine', n: 3, r: [8, 12], rest: 90, inc: 2.5, kind: 'pull',
    setup: '가슴 패드 높이를 조절해 손잡이를 잡았을 때 팔이 완전히 펴지도록 합니다.',
    form: '가슴을 패드에 붙이고 팔꿈치를 몸 뒤로 보내며 견갑을 모읍니다. 정점에서 1초 멈춤.',
    mis: '가슴이 패드에서 떨어짐 · 어깨 으쓱 · 목 앞으로 내밀기',
    alts: ['one-arm-db-row', 'seated-cable-row', 'machine-row'] }),
  X('seated-cable-row', '시티드 케이블 로우', 'Seated Cable Row', { p: ['등'], s: ['이두', '후면삼각근'], eq: '케이블', mode: 'machine', n: 3, r: [10, 12], rest: 75, inc: 2.5, kind: 'pull',
    setup: '발판에 발을 고정하고 무릎을 살짝 굽혀 상체를 곧게 세웁니다.',
    form: '팔꿈치를 옆구리를 스치듯 뒤로 당기고 견갑을 모읍니다. 돌아올 때 등이 늘어나는 느낌을 유지.',
    mis: '상체를 앞뒤로 흔듦 · 허리 둥글게 말림 · 어깨 으쓱',
    alts: ['chest-supported-row', 'machine-row'] }),
  X('reverse-pec-deck', '리버스 펙덱', 'Reverse Pec Deck', { p: ['후면삼각근'], s: ['등'], eq: '머신', mode: 'machine', n: 3, r: [12, 15], rest: 60, inc: 2.5, kind: 'iso',
    setup: '가슴을 패드에 붙이고 손잡이를 어깨 높이로 맞춥니다.',
    form: '팔을 거의 편 채 팔꿈치로 큰 원을 그리듯 뒤로 엽니다.',
    mis: '팔로 당김 · 어깨 으쓱 · 반동', alts: ['face-pull'] }),
  X('ez-bar-curl', 'EZ바 컬', 'EZ-Bar Curl', { p: ['이두'], s: ['전완'], eq: '바벨', mode: 'total', n: 3, r: [8, 12], rest: 75, inc: 2.5, kind: 'pull', rir: 1,
    setup: 'EZ바 안쪽 그립으로 어깨너비로 잡고 팔꿈치를 옆구리에 둡니다.',
    form: '팔꿈치를 고정한 채 말아 올리고 천천히 완전히 펴며 내립니다.',
    mis: '허리 반동 · 팔꿈치가 앞으로 나감 · 내릴 때 힘을 뺌', alts: ['db-curl', 'cable-curl'] }),
  X('hammer-curl', '해머 컬', 'Hammer Curl', { p: ['이두', '전완'], eq: '덤벨', mode: 'perHand', n: 3, r: [10, 12], rest: 60, inc: 2, kind: 'pull', rir: 1,
    setup: '덤벨을 중립 그립(엄지가 위)으로 잡고 몸 옆에 둡니다.',
    form: '팔꿈치를 고정하고 어깨 쪽으로 말아 올립니다.', mis: '몸 흔들기 · 손목 꺾임', alts: ['cable-curl', 'db-curl'] }),
  // Pull alternatives
  X('pull-up', '풀업', 'Pull-up', { p: ['등'], s: ['이두'], eq: '맨몸', mode: 'bodyweight', n: 3, r: [5, 10], rest: 120, inc: 2.5, kind: 'pull', setup: '어깨너비보다 넓게 오버핸드 그립.', form: '가슴을 바에 가져가듯 당깁니다.', mis: '반동(키핑) · 반만 내려옴' }),
  X('assisted-pull-up', '어시스티드 풀업', 'Assisted Pull-up', { p: ['등'], s: ['이두'], eq: '머신', mode: 'machine', n: 3, r: [8, 12], rest: 90, inc: 2.5, kind: 'pull', setup: '표시 중량은 보조 무게(낮을수록 어려움). 무릎 패드에 올라섭니다.', form: '어깨를 내리고 가슴을 바에 가져가듯 당깁니다.', mis: '반동 · 어깨 으쓱' }),
  X('one-arm-db-row', '원암 덤벨 로우', 'One-Arm Dumbbell Row', { p: ['등'], s: ['이두', '후면삼각근'], eq: '덤벨', mode: 'perHand', n: 3, r: [8, 12], rest: 90, inc: 2, kind: 'pull', setup: '벤치에 한 손과 무릎을 올리고 등을 평평하게.', form: '팔꿈치를 엉덩이 쪽으로 당깁니다.', mis: '몸통 회전 · 반동' }),
  X('machine-row', '머신 로우', 'Machine Row', { p: ['등'], s: ['이두', '후면삼각근'], eq: '머신', mode: 'machine', n: 3, r: [8, 12], rest: 90, inc: 2.5, kind: 'pull', setup: '가슴 패드와 손잡이 위치를 조절.', form: '견갑을 모으며 당깁니다.', mis: '상체 반동 · 어깨 으쓱' }),
  X('face-pull', '페이스 풀', 'Face Pull', { p: ['후면삼각근'], s: ['등'], eq: '케이블', mode: 'machine', n: 3, r: [12, 15], rest: 60, inc: 2.5, kind: 'pull', setup: '풀리를 얼굴 높이에 두고 로프를 잡습니다.', form: '로프를 이마 양옆으로 당기며 팔꿈치를 높게 벌립니다.', mis: '너무 무겁게 해서 상체 반동' }),
  X('db-curl', '덤벨 컬', 'Dumbbell Curl', { p: ['이두'], eq: '덤벨', mode: 'perHand', n: 3, r: [8, 12], rest: 75, inc: 2, kind: 'pull', setup: '덤벨을 손바닥이 앞으로 향하게 잡습니다.', form: '팔꿈치 고정, 올리며 손목을 살짝 회전.', mis: '반동 · 팔꿈치 전진' }),
  X('cable-curl', '케이블 컬', 'Cable Curl', { p: ['이두'], eq: '케이블', mode: 'machine', n: 3, r: [10, 12], rest: 60, inc: 2.5, kind: 'pull', setup: '풀리를 낮게 두고 바를 잡습니다.', form: '팔꿈치를 고정하고 말아 올립니다.', mis: '상체 젖히기' }),
  // ---------- Legs ----------
  X('leg-press', '레그 프레스', 'Leg Press', { p: ['대퇴사두', '둔근'], s: ['햄스트링'], eq: '머신', mode: 'machine', n: 4, r: [10, 12], rest: 120, inc: 5, kind: 'legs',
    setup: '등과 엉덩이를 패드에 붙이고 발을 어깨너비로 플레이트 중앙에 둡니다.',
    form: '무릎이 발끝 방향을 따라가게 하며 엉덩이가 들리지 않는 깊이까지 내렸다 밉니다. 끝에서 무릎을 완전히 잠그지 않습니다.',
    mis: '엉덩이가 패드에서 들림(골반 말림) · 무릎 안쪽 모임 · 무릎 완전 잠금 · 반만 내려감',
    alts: ['hack-squat', 'goblet-squat', 'barbell-squat'] }),
  X('romanian-deadlift', '루마니안 데드리프트', 'Romanian Deadlift', { p: ['햄스트링', '둔근'], s: ['등'], eq: '바벨', mode: 'total', n: 3, r: [8, 10], rest: 120, inc: 2.5, kind: 'legs',
    setup: '바를 허벅지 앞에 두고 어깨너비로 잡습니다. 무릎은 살짝만 굽힙니다.',
    form: '엉덩이를 뒤로 밀며 바를 다리에 붙여 내리고, 햄스트링이 당겨지는 지점에서 엉덩이를 앞으로 밀어 올라옵니다. 등은 중립 유지.',
    mis: '허리를 둥글게 말음 · 바가 몸에서 멀어짐 · 스쿼트처럼 무릎을 과하게 굽힘',
    alts: ['lying-leg-curl', 'hip-thrust'] }),
  X('leg-extension', '레그 익스텐션', 'Leg Extension', { p: ['대퇴사두'], eq: '머신', mode: 'machine', n: 3, r: [12, 15], rest: 60, inc: 2.5, kind: 'iso', setup: '무릎 축이 머신 회전축과 맞도록 시트 조절, 패드는 발목 위.', form: '끝에서 1초 수축 후 천천히 내립니다.', mis: '반동으로 차올림 · 엉덩이 들림' }),
  X('seated-leg-curl', '시티드 레그 컬', 'Seated Leg Curl', { p: ['햄스트링'], eq: '머신', mode: 'machine', n: 3, r: [10, 12], rest: 60, inc: 2.5, kind: 'iso', setup: '무릎 축을 머신 축에 맞추고 허벅지 패드를 고정.', form: '발뒤꿈치를 엉덩이 방향으로 당기고 천천히 돌아옵니다.', mis: '상체 젖힘 · 반동' }),
  X('standing-calf-raise', '스탠딩 카프 레이즈', 'Standing Calf Raise', { p: ['종아리'], eq: '머신', mode: 'machine', n: 4, r: [10, 15], rest: 60, inc: 5, kind: 'iso', setup: '발볼을 발판 끝에 올립니다.', form: '발뒤꿈치를 최대한 내려 스트레치하고 최대한 높이 올려 1초 정지.', mis: '반동 · 가동범위 짧음', alts: ['seated-calf-raise'] }),
  X('cable-crunch', '케이블 크런치', 'Cable Crunch', { p: ['복근'], eq: '케이블', mode: 'machine', n: 3, r: [12, 15], rest: 60, inc: 2.5, kind: 'iso', setup: '무릎 꿇고 로프를 머리 양옆에 고정.', form: '고관절이 아니라 척추를 말아 팔꿈치를 무릎으로 가져갑니다.', mis: '엉덩이를 뒤로 빼며 상체만 숙임' }),
  // Legs alternatives
  X('hack-squat', '핵 스쿼트', 'Hack Squat', { p: ['대퇴사두'], s: ['둔근'], eq: '머신', mode: 'machine', n: 3, r: [8, 12], rest: 120, inc: 5, kind: 'legs', setup: '등을 패드에 붙이고 발은 어깨너비.', form: '무릎이 발끝 방향으로 나가게 깊게 앉았다 일어섭니다.', mis: '발뒤꿈치 들림 · 반만 앉음' }),
  X('goblet-squat', '고블릿 스쿼트', 'Goblet Squat', { p: ['대퇴사두', '둔근'], eq: '덤벨', mode: 'total', n: 3, r: [10, 12], rest: 90, inc: 2, kind: 'legs', setup: '덤벨을 가슴 앞에 세로로 듭니다.', form: '가슴을 세운 채 깊게 앉습니다.', mis: '상체가 앞으로 무너짐' }),
  X('barbell-squat', '바벨 스쿼트', 'Barbell Back Squat', { p: ['대퇴사두', '둔근'], s: ['햄스트링'], eq: '바벨', mode: 'total', n: 4, r: [5, 8], rest: 150, inc: 2.5, kind: 'legs', setup: '바를 승모근 상부에 얹고 어깨너비~약간 넓게 서 세이프티 바를 세팅합니다.', form: '복압을 잡고 앉았다 일어섭니다.', mis: '무릎 안쪽 모임 · 허리 말림 · 세이프티 없이 시도' }),
  X('lying-leg-curl', '라잉 레그 컬', 'Lying Leg Curl', { p: ['햄스트링'], eq: '머신', mode: 'machine', n: 3, r: [10, 12], rest: 60, inc: 2.5, kind: 'iso', setup: '패드를 종아리 아래쪽에 맞춥니다.', form: '엉덩이가 뜨지 않게 말아 올립니다.', mis: '엉덩이 들림' }),
  X('hip-thrust', '힙 쓰러스트', 'Hip Thrust', { p: ['둔근'], s: ['햄스트링'], eq: '바벨', mode: 'total', n: 3, r: [8, 12], rest: 90, inc: 5, kind: 'legs', setup: '벤치에 어깨뼈 하단을 기대고 바를 골반 위에.', form: '턱을 당기고 엉덩이를 완전히 수축합니다.', mis: '허리 과신전' }),
  X('seated-calf-raise', '시티드 카프 레이즈', 'Seated Calf Raise', { p: ['종아리'], eq: '머신', mode: 'machine', n: 3, r: [12, 15], rest: 60, inc: 2.5, kind: 'iso', setup: '무릎 패드를 허벅지 위에 고정.', form: '끝까지 내렸다 최대한 올립니다.', mis: '반동' }),
  // Abs (add-on session)
  X('hanging-leg-raise', '행잉 레그 레이즈', 'Hanging Leg Raise', { p: ['복근'], eq: '맨몸', mode: 'bodyweight', n: 3, r: [10, 15], rest: 60, inc: 2.5, kind: 'iso', setup: '바에 어깨너비로 매달려 어깨를 살짝 끌어내립니다.', form: '골반을 말아 올리듯 다리를 들어 올리고, 흔들림 없이 천천히 내립니다.', mis: '몸을 흔들어 반동 · 다리만 들고 골반은 그대로' }),
  X('ab-wheel-rollout', '앱 롤아웃', 'Ab Wheel Rollout', { p: ['복근'], eq: '기타', mode: 'bodyweight', n: 3, r: [8, 12], rest: 60, inc: 2.5, kind: 'iso', setup: '무릎을 매트에 대고 휠을 어깨 아래에 둡니다.', form: '복부를 조여 허리가 꺾이지 않는 범위까지 굴려 나갔다 복근 힘으로 돌아옵니다.', mis: '허리가 처짐 · 엉덩이로 당겨 돌아옴' }),
  X('reverse-crunch', '리버스 크런치', 'Reverse Crunch', { p: ['복근'], eq: '맨몸', mode: 'bodyweight', n: 2, r: [12, 15], rest: 45, inc: 2.5, kind: 'iso', setup: '바닥에 누워 무릎을 90°로 들고 손은 몸 옆에 둡니다.', form: '골반을 바닥에서 말아 올려 무릎을 가슴 쪽으로 가져오고 천천히 내립니다.', mis: '다리를 던지듯 반동 · 목에 힘 줌' }),
  X('walking-lunge', '워킹 런지', 'Walking Lunge', { p: ['대퇴사두', '둔근'], eq: '덤벨', mode: 'perHand', n: 3, r: [10, 12], rest: 90, inc: 2, kind: 'legs', setup: '덤벨을 양손에 들고 곧게 섭니다.', form: '보폭을 크게, 뒷무릎이 바닥에 닿기 직전까지.', mis: '상체 숙임 · 보폭이 짧음' }),
];

const item = (exerciseId, sets, repMin, repMax, rest, rir = 2) => ({ exerciseId, sets, repMin, repMax, rest, rir });
export const DEFAULT_ROUTINES = [
  { id: 'r-push', name: 'Push Day', desc: '가슴 · 어깨 · 삼두', items: [
    item('incline-db-press', 4, 8, 10, 120), item('machine-chest-press', 3, 10, 12, 90), item('cable-fly', 3, 12, 15, 60),
    item('shoulder-press', 3, 8, 12, 90), item('lateral-raise', 4, 12, 15, 60, 1), item('rope-pushdown', 3, 10, 15, 60), item('overhead-cable-ext', 3, 12, 15, 60)] },
  { id: 'r-pull', name: 'Pull Day', desc: '등 · 후면 어깨 · 이두', items: [
    item('lat-pulldown', 4, 8, 12, 90), item('chest-supported-row', 3, 8, 12, 90), item('seated-cable-row', 3, 10, 12, 75),
    item('reverse-pec-deck', 3, 12, 15, 60), item('ez-bar-curl', 3, 8, 12, 75, 1), item('hammer-curl', 3, 10, 12, 60, 1)] },
  { id: 'r-legs', name: 'Legs Day', desc: '하체 · 종아리 · 복근', items: [
    item('leg-press', 4, 10, 12, 120), item('romanian-deadlift', 3, 8, 10, 120), item('leg-extension', 3, 12, 15, 60),
    item('seated-leg-curl', 3, 10, 12, 60), item('standing-calf-raise', 4, 10, 15, 60), item('cable-crunch', 3, 12, 15, 60)] },
  { id: 'r-full', name: 'Full Body', desc: '전신 · 주 2~3회용', items: [
    item('leg-press', 3, 10, 12, 120), item('machine-chest-press', 3, 10, 12, 90), item('lat-pulldown', 3, 8, 12, 90),
    item('romanian-deadlift', 3, 8, 10, 120), item('shoulder-press', 2, 8, 12, 90), item('seated-cable-row', 2, 10, 12, 75), item('cable-crunch', 2, 12, 15, 60)] },
];

export const ADDON_ROUTINES = ['r-abs'];
DEFAULT_ROUTINES.push({ id: 'r-abs', name: 'Abs', desc: '복근 · 추가 세션', addon: true, items: [
  item('cable-crunch', 3, 12, 15, 60), item('hanging-leg-raise', 3, 10, 15, 60), item('ab-wheel-rollout', 3, 8, 12, 60), item('reverse-crunch', 2, 12, 15, 45)] });

export const MUSCLES = ['가슴', '등', '어깨', '후면삼각근', '이두', '삼두', '전완', '대퇴사두', '햄스트링', '둔근', '종아리', '복근'];
export const EQUIPMENT = ['덤벨', '바벨', '머신', '케이블', '맨몸', '기타'];
