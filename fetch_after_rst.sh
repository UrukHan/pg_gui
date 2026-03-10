#!/bin/bash
HOST=192.168.1.150
PORT=45454

echo "=== Test: *RST + wait 5s + FUNC:RUN + wait 5s + FETCH ==="
exec 3<>/dev/tcp/$HOST/$PORT 2>/dev/null
echo -e "*RST\r" >&3
read -t 2 resp <&3 2>/dev/null
echo "*RST -> [$resp]"
echo "Waiting 5s for reset..."
sleep 5
echo -e "FUNC:RUN\r" >&3
read -t 2 resp <&3 2>/dev/null
echo "FUNC:RUN -> [$resp]"
echo "Waiting 5s for measurement to start..."
sleep 5
for i in 1 2 3 4 5; do
    echo -e "FETCH:ALL_S?\r" >&3
    read -t 3 resp <&3 2>/dev/null
    echo "FETCH[$i] -> [$resp]"
    sleep 2
done
echo -e "FUNC:STOP\r" >&3
read -t 2 resp <&3 2>/dev/null
echo "FUNC:STOP -> [$resp]"
exec 3>&-

echo ""
echo "=== Test 2: Just FUNC:RUN (NO RST) + long wait + FETCH ==="
exec 3<>/dev/tcp/$HOST/$PORT 2>/dev/null
echo -e "FUNC:RUN\r" >&3
read -t 2 resp <&3 2>/dev/null
echo "FUNC:RUN -> [$resp]"
echo "Waiting 10s..."
sleep 10
for i in 1 2 3; do
    echo -e "FETCH:ALL_S?\r" >&3
    read -t 3 resp <&3 2>/dev/null
    echo "FETCH[$i] -> [$resp]"
    sleep 2
done
exec 3>&-

echo "=== DONE ==="
