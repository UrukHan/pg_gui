#!/bin/bash
echo "=== Inode usage by /run subdirectories ==="
for d in /run/*/; do
  count=$(find "$d" -type f 2>/dev/null | wc -l)
  echo "$count $d"
done | sort -rn | head -15

echo ""
echo "=== Total inodes on /run ==="
df -hi /run
