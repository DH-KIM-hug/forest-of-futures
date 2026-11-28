#!/bin/zsh
# 거래소 화면 그림(GPT, codex). 사용법: zsh run.sh name[:t] ...   (:t = 투명 배경)
cd /Users/house_of_4k2b/orca/projects/future-clicker
SG=~/.claude/skills/sprite-gen/.venv/bin/sprite-gen
P=docs/art/v5/prompts/ui
for spec in "$@"; do
  n=${spec%%:*}; t=""; [[ $spec == *:t ]] && t="--transparent"
  ( $SG gen --provider codex --prompt-file $P/$n.txt --ref docs/art/v5/golden/home_stump.png --ref docs/art/v5/golden/forest_palette.png $t --out docs/art/v5/ui/$n.png > $P/logs/$n.log 2>&1; echo "$n exit $?" >> $P/logs/_exits.txt ) &
done
wait
