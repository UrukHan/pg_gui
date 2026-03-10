#!/bin/bash
HOST=192.168.1.150
PORT=45454
echo "=== Fetching TH2690 data ==="
for i in $(seq 1 10); do
    exec 3<>/dev/tcp/$HOST/$PORT 2>/dev/null
    echo -e "FETCH:ALL_S?\r" >&3
    read -t 3 resp <&3 2>/dev/null
    exec 3>&-
    resp=$(echo "$resp" | tr -d '\r\n')
    echo "[$i] $resp"
    sleep 1
done
