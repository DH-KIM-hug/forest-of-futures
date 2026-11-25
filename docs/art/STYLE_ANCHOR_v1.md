# 스타일 고정문 v1 — 선물의 숲

- 동결일: 2026-11-25
- 승인: 사용자가 시안 4종 중 D(파스텔 소프트 셀) 선택
- 기준 그림: `docs/gdd/art-style-compare/D_pastel-cel.png`
- 상태: 동결(v1). 고치면 v2로 올리고 날짜·이유를 아래 변천 기록에 남긴다.

## 재료 세계관 (한 문단)
이 세계의 모든 것은 파스텔 물감으로 칠한 동화책 삽화다. 면은 단색 블록으로 나누고, 그림자는 같은 색계열의 짙은 2톤으로만 준다. 얇은 밝은 하이라이트 한 줄로 형태를 살린다. 번짐·종이 결·사진 질감은 없다.

## 허용 / 금지
- 허용: 단색 블록, 2톤 셀 그림자, 얇은 하이라이트 선, 부드러운 외곽 (두께는 얇게)
- 금지: 사진 질감, 수채 번짐, 종이 결, 강한 광택, 3D 볼륨 셰이딩, 그라데이션 배경, 글자·테두리

## 팔레트 (기준 그림에서 추출, 근사치)
- 주인공 갈색: 주황빛 갈색 계열 (털), 크림색 (주둥이·배)
- 옷: 황토색 패치 천
- 숲: 파스텔 연두·연녹 (나뭇잎·나무), 크림 배경
- 강조: 황금 도토리 (환희 연출 전용)

## 빛
- 왼쪽 위에서 오는 단일 광원. 그림자는 오른쪽 아래, 같은 색계열의 짙은 톤.

## 인물
- 둥근 통통한 몸, 큰 검은 눈, 크림색 주둥이·배, 뭉툭한 발
- 머리 크기는 몸의 약 40% (기준 그림 기준)
- 정면 기준 서 있는 자세, 전신 한 장

## CRITICAL RULE
면은 단색 블록으로만 채운다. 부피는 2톤 셀 그림자와 얇은 하이라이트로만 준다. 질감을 더하지 말 것.

## 고정문 (모델 입력용 영문 블록, v1)
```
Style: pastel soft cel shading, smooth pastel color blocks, soft two-tone cel shadows, a thin light highlight, polished warm mobile game character art. Same character as the reference image: orange-brown squirrel with cream muzzle and belly, round chubby body, big dark eyes, rough tan patched tunic. Full body, centered, same size and proportions as the reference, plain solid cream background, no text, no border.
```
CRITICAL: flat colour blocks only; volume from two-tone cel shadow and a thin highlight, never from texture.

## 기준 그림 세트
- 기준 1: `docs/gdd/art-style-compare/D_pastel-cel.png` (주인공 전체, 스타일 기준)
- 표정 5종 (v1 생성): `docs/art/squirrel-expressions/` — 01 평온, 02 환희, 03 식은땀, 04 오열, 05 멍함

## 변천 기록
- v1 (2026-11-25): 시안 A·B·C·D 비교 후 D 선택. 표정 5종 생성 (참조 이미지: 기준 1).
