// 기록관·전광판·엔딩의 읽기 전용 모델 (M9에서 채운다).
import type { GameState } from '../../engine/types';
export const archiveCount = (g: GameState): number => Object.keys(g.family.ledger).length;
