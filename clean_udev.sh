#!/bin/bash
echo "=== Before cleanup ==="
df -hi /run

echo ""
echo "=== Cleaning /run/udev/data/ ==="
rm -rf /run/udev/data/*

echo ""
echo "=== Reloading udev ==="
udevadm control --reload-rules
udevadm trigger

echo ""
echo "=== After cleanup ==="
df -hi /run
find /run/udev/ -type f | wc -l
