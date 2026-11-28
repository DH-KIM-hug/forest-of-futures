#!/bin/bash
# 라이트 엔딩과 새 만화 컷을 codex 로 뽑는다. 이미 있는 그림은 건너뛴다(다시 돌리면 이어서 뽑는다).
# 한 번에 5개씩. 어느 하나라도 75(codex 를 못 씀, 한도)로 끝나면 그 자리에서 멈춘다. 다른 제공자로 바꾸지 않는다.
# 사용: bash run_jobs.sh [id ...]  (id 를 주면 그것만, 있어도 다시 뽑는다)
cd "$(dirname "$0")/../../../../.." || exit 1
SG=~/.claude/skills/sprite-gen/.venv/bin/sprite-gen
P=docs/art/v5/prompts/endings_lite
LOG=$P/logs; mkdir -p "$LOG"
only=" $* "
todo=()
while IFS=$'\t' read -r id out refs; do
  if [ -n "$*" ]; then [[ "$only" == *" $id "* ]] || continue; rm -f "$out"; else [ -f "$out" ] && continue; fi
  todo+=("$id|$out|$refs")
done < $P/jobs.tsv
echo "todo ${#todo[@]}"
i=0
while [ $i -lt ${#todo[@]} ]; do
  pids=(); ids=()
  for j in 0 1 2 3 4; do
    [ $((i+j)) -ge ${#todo[@]} ] && break
    IFS='|' read -r id out refs <<< "${todo[$((i+j))]}"
    args=(); IFS=',' read -ra rr <<< "$refs"; for r in "${rr[@]}"; do args+=(--ref "$r"); done
    $SG gen --provider codex --prompt-file $P/$id.txt "${args[@]}" --out "$out" > $LOG/$id.log 2>&1 &
    pids+=($!); ids+=($id)
  done
  stop=0
  for k in "${!pids[@]}"; do
    wait ${pids[$k]}; rc=$?
    echo "${ids[$k]} rc=$rc"
    [ $rc -eq 75 ] && stop=1
  done
  [ $stop -eq 1 ] && { echo "CODEX_UNAVAILABLE exit 75: stopped"; exit 75; }
  i=$((i+5))
done
echo done
