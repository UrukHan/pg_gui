#!/bin/bash
echo "=== Before ==="
df -hi /run

echo ""
echo "=== Structure of /run/udev/ ==="
ls -la /run/udev/
for d in /run/udev/*/; do
  count=$(find "$d" -type f 2>/dev/null | wc -l)
  echo "$count $d"
done | sort -rn

echo ""
echo "=== Deleting all files in /run/udev/ with find ==="
find /run/udev/ -type f -delete
echo "Done deleting"

echo ""
echo "=== After ==="
df -hi /run
find /run/udev/ -type f | wc -l
