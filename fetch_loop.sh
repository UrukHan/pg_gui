#!/bin/bash
# Fetch data from TH2690 every 2 seconds for 30 seconds
# Run on host while user interacts with front panel
HOST=192.168.1.150
PORT=45454

echo "=== Fetching TH2690 data every 2s for 30s ==="
echo "=== Press Run/Stop on front panel NOW ==="
for i in $(seq 1 15); do
    exec 3<>/dev/tcp/$HOST/$PORT 2>/dev/null
    if [ $? -ne 0 ]; then
        echo "[$i] CONNECT FAILED"
        sleep 2
        continue
    fi
    echo -e "FETCH:ALL_S?\r" >&3
    read -t 3 resp <&3 2>/dev/null
    exec 3>&-
    resp=$(echo "$resp" | tr -d '\r\n')
    echo "[$i] $resp"
    sleep 2
done
echo "=== DONE ==="
