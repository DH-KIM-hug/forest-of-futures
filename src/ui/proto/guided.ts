// 이끄는 길(U-46 사용자: "프롤로그 하면 딱 다음 행동만 활성화되어야 하는데 다른 행동들도 다 활성화되네.")
// 첫 생의 튜토리얼 사슬(프롤로그 → 굴리기 → 추심원 → 지도 · 사무소 대출 → 알바 · 쳇바퀴 · 알바 → 중고폰 → 첫 주문 → 두 번째 대출 → 전표 뒷면) 동안
// 걸음마다 "다음 한 가지"만 열어 둔다. 나머지 단추(다른 탭 · 판의 칸 · 지도의 가게 · 머리의 단추)는 흐리게 잠기고, 누르면 열린 쪽이 한 번 반짝일 뿐 아무 일도 없다.
// 순수 함수다: 엔진 값과 시제품 상태를 받아 지금 걸음과 열린 단추(CSS 선택자)를 돌려준다. 걸음은 저장된 상태에서 다시 셀 수 있다(따로 적어 둘 것이 없다).
// 전표 뒷면을 닫으면(tutorial = done) 끝이다. 컷인 · 알림 장(대사 넘기기)은 늘 눌린다 — 고르는 단추만 이 길을 따른다.

export type GuideStep =
  | 'roll' | 'toMap' | 'borrow' | 'toLot' | 'openPanel' | 'hire' | 'place' | 'hire2' | 'phone' | 'order' | 'scene';

export interface GuideIn {
  /** 몇 번째 생(1 부터) */ life: number;
  prologue: boolean;
  tutorial: 'none' | 'await' | 'run' | 'lost' | 'notice' | 'done';
  tab: 'lot' | 'map' | 'phone';
  waiting: boolean; loanTaken: boolean; forceTrade: boolean; panelOpen: boolean;
  /** 엄마의 쳇바퀴에 알바가 있다 */ momStaffed: boolean;
  /** 보조 쳇바퀴 수 · 그 가운데 알바가 든 수 */ extras: number; extrasStaffed: number;
  /** 쳇바퀴 하나 더 놓을 돈이 있다 */ canPlace: boolean;
}
export interface Guide { step: GuideStep; /** 눌러도 되는 것(CSS 선택자). 컷인의 고르는 단추도 여기에 든 것만 */ allow: string[] }

/** 지금 걸음. 이끄는 길이 끝났거나(첫 생이 아니거나 튜토리얼이 끝났다) 프롤로그 중이면 null */
export function guideStep(s: GuideIn): Guide | null {
  if (s.life > 1 || s.prologue || s.tutorial === 'done') return null;
  // 첫 주문 뒤(짜 둔 시세가 가는 중 · 청산 장면 · 전표 뒷면): 장면만 넘긴다. 고를 것은 [더 빌린다] 하나
  if (s.tutorial === 'run' || s.tutorial === 'lost' || s.tutorial === 'notice') return { step: 'scene', allow: ['[data-choice="borrow"]', '[data-choice="ok"]', '[data-notice-ok]'] };
  // 중고폰이 울렸다 → 앱(거래소 탭) → 롱 또는 숏(어느 쪽이든 같은 한 걸음: 첫 주문)
  if (s.forceTrade || (s.tutorial === 'await' && s.tab === 'phone')) return s.tab === 'phone'
    ? { step: 'order', allow: ['.pt-orders .pt-btn.long', '.pt-orders .pt-btn.short'] }
    : { step: 'phone', allow: ['[data-tab="phone"]'] };
  // 빌리기 전: 굴린다 → 추심원이 오면 [사무소로 간다] → 지도의 [빌리기]
  if (!s.loanTaken) {
    if (!s.waiting) return { step: 'roll', allow: ['[data-tap]', '[data-tap2]'] };
    return s.tab === 'map'
      ? { step: 'borrow', allow: ['[data-borrow="shark1"]'] }
      : { step: 'toMap', allow: ['[data-choice="go"]', '[data-wait-go]', '[data-tab="map"]'] };
  }
  // 빌린 뒤: 집 → 판을 펴고 → 엄마의 쳇바퀴에 알바 → 빈 자리에 쳇바퀴 → 그 쳇바퀴에 알바
  const want: GuideStep = !s.momStaffed ? 'hire' : s.extras === 0 && s.canPlace ? 'place' : s.extrasStaffed < s.extras ? 'hire2' : 'phone';
  if (want === 'phone') return { step: 'phone', allow: ['[data-tab="phone"]'] };
  if (s.tab !== 'lot') return { step: 'toLot', allow: ['[data-tab="lot"]'] };
  if (!s.panelOpen) return { step: 'openPanel', allow: ['[data-strip]'] };
  return want === 'hire' ? { step: 'hire', allow: ['[data-tile="0"]'] }
    : want === 'place' ? { step: 'place', allow: ['.pr-tile[data-act="place"]'] }
    : { step: 'hire2', allow: ['.pr-tile[data-act="hire"]'] };
}

/** 이 요소를 눌러도 되는가: 열린 선택자 안이거나, 대사 넘기기 · 알림 장 · 소리 단추처럼 길과 상관없는 것 */
export function allowedEl(el: Element | null, g: Guide): boolean {
  if (!el) return true;
  const choice = el.closest('[data-choice]');
  if (choice) return g.allow.some((sel) => choice.matches(sel));
  if (el.closest(g.allow.join(','))) return true;
  // 길과 상관없는 것: 컷인(넘기기 · 건너뛰기), 알림 장, 프롤로그, 인증서 물음, 소리 단추
  if (el.closest('.pr-cutin, .pr-notice, .pr-pro, .pr-profit, .pr-end, [data-always]')) return true;
  return false;
}
