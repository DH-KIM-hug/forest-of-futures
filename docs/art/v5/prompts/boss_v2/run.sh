#!/bin/bash
# 오소리 대부 v2 로 다시 그리기. 사용: bash run.sh id [id ...]  (5개씩 병렬, 75 면 멈춘다)
cd "$(dirname "$0")/../../../../.." || exit 1
SG=~/.claude/skills/sprite-gen/.venv/bin/sprite-gen
A=docs/art/v5; P=$A/prompts/boss_v2; G=$A/golden
mkdir -p $P/logs
job() {
  id=$1
  case $id in
    LE*) out=$A/endings_lite/$id.png; args=(--ref $A/endings_lite/boss_v1/${id}.png --ref $A/manga/p1_color.png --ref $G/hero_phone.png --ref $G/boss_v2_ref.png --ref $G/boss_v2.png);;
    t_*) out=$A/manga/$id.png; args=(--ref $A/manga/${id}_v1.png --ref $A/manga/p1_color.png --ref $G/hero_phone.png --ref $G/boss_v2_ref.png --ref $G/boss_v2.png);;
    b_boss) out=$A/raw/b_boss.png; args=(--ref $G/boss_v2_ref.png --ref $G/boss_v2.png --ref $A/raw/b_collector.png --transparent);;
    c_boss) out=$A/raw/c_boss.png; args=(--ref $G/boss_v2_ref.png --ref $G/boss_v2.png --ref $A/raw/c_collector.png --transparent);;
  esac
  [ -n "$SUFFIX" ] && out=${out%.png}_$SUFFIX.png
  $SG gen --provider codex --prompt-file $P/$id.txt "${args[@]}" --out $out > $P/logs/$id${SUFFIX:+_$SUFFIX}.log 2>&1
  echo "$id rc=$?"
}
ids=("$@"); i=0
while [ $i -lt ${#ids[@]} ]; do
  pids=()
  for j in 0 1 2 3 4; do [ $((i+j)) -ge ${#ids[@]} ] && break; job ${ids[$((i+j))]} > $P/logs/.rc_$j & pids+=($!); done
  stop=0
  for j in "${!pids[@]}"; do wait ${pids[$j]}; r=$(cat $P/logs/.rc_$j); echo "$r"; [[ "$r" == *rc=75 ]] && stop=1; rm -f $P/logs/.rc_$j; done
  [ $stop -eq 1 ] && { echo "CODEX_UNAVAILABLE 75"; exit 75; }
  i=$((i+5))
done
