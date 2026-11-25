// 브라우저 직결 시세(시제품용)의 출처·종목 대응. 대응표의 원본은 server/config/sources.json 이다(서버와 같은 파일을 그대로 읽는다. 복사 없음).
// 시제품은 게임 서버 없이 GitHub Pages 에서 돌아야 해서 이 대응이 번들에 들어간다(공개 저장소라 허용). 서버 판 앱은 이 폴더를 쓰지 않는다.
// 이 폴더 밖의 코드는 실제 이름을 알면 안 된다. 여기서 나가는 것은 가상 종목 id 와 가상 가격뿐이다.
import { index, primary, volumeKeys } from '../../../server/config/sources.json';

/** 출처 WebSocket 주소와 같은 호스트의 조회(info) 주소. */
export const SOCKET_URL: string = primary.url;
export const INFO_URL: string = primary.url.replace(/^wss:/, 'https:').replace(/\/ws$/, '/info');

/** 내부 키(DTC.. 또는 지수 전용 IDX_XRP) → 실제 코인. */
export const COINS: Record<string, string> = primary.coins;
export const INDEX_ID: string = index.id;
export const INDEX_MEMBERS: string[] = index.primaryMembers;
export const VOLUME_KEYS: string[] = volumeKeys;
