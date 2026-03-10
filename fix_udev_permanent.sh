#!/bin/bash
# Permanent fix for /run/udev/links inode exhaustion
# This is a known issue on Ubuntu with many device events

echo "=== Current state ==="
df -hi /run
find /run/udev/links -type d 2>/dev/null | wc -l

echo ""
echo "=== Step 1: Clean existing cruft ==="
find /run/udev/ -type f -delete 2>/dev/null
find /run/udev/links/ -mindepth 1 -type d -empty -delete 2>/dev/null
echo "Cleaned."

echo ""
echo "=== Step 2: Create systemd-tmpfiles cleanup rule ==="
cat > /etc/tmpfiles.d/cleanup-udev-links.conf << 'EOF'
# Clean stale udev links directories older than 1 day
# This prevents /run/udev/links from accumulating 500K+ entries
e /run/udev/links - - - 1d
EOF
echo "Created /etc/tmpfiles.d/cleanup-udev-links.conf"

echo ""
echo "=== Step 3: Create cron job for periodic cleanup ==="
cat > /etc/cron.d/cleanup-udev << 'EOF'
# Every 6 hours, clean stale udev link dirs to prevent inode exhaustion on /run
0 */6 * * * root find /run/udev/links/ -mindepth 1 -type d -empty -delete 2>/dev/null; find /run/udev/links/ -mindepth 1 -mmin +360 -delete 2>/dev/null
EOF
chmod 644 /etc/cron.d/cleanup-udev
echo "Created /etc/cron.d/cleanup-udev"

echo ""
echo "=== Step 4: Increase tmpfs inode limit ==="
# Check current fstab for /run
grep -q '/run' /etc/fstab && echo "WARNING: /run already in fstab" || true

# Remount /run with more inodes (2M instead of default ~1M)
mount -o remount,nr_inodes=2097152 /run 2>/dev/null && echo "Remounted /run with 2M inodes" || echo "Could not remount (systemd manages /run)"

echo ""
echo "=== Step 5: Reload udev to reset state ==="
systemctl restart systemd-udevd 2>/dev/null || udevadm control --reload-rules 2>/dev/null
echo "udev restarted"

echo ""
echo "=== After fix ==="
df -hi /run
find /run/udev/ -type f 2>/dev/null | wc -l
echo "=== DONE ==="
