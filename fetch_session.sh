#!/bin/bash
# Test: send multiple commands on SAME TCP connection (session)
HOST=192.168.1.150
PORT=45454

echo "=== Test 1: FUNC:RUN + FETCH on SAME connection ==="
exec 3<>/dev/tcp/$HOST/$PORT 2>/dev/null
echo -e "FUNC:RUN\r" >&3
read -t 2 resp <&3 2>/dev/null
echo "FUNC:RUN -> [$resp]"
sleep 2
echo -e "FETCH:ALL_S?\r" >&3
read -t 3 resp <&3 2>/dev/null
echo "FETCH:ALL_S? -> [$resp]"
sleep 1
echo -e "FETCH:ALL_S?\r" >&3
read -t 3 resp <&3 2>/dev/null
echo "FETCH:ALL_S? -> [$resp]"
sleep 1
echo -e "FETCH:ALL_S?\r" >&3
read -t 3 resp <&3 2>/dev/null
echo "FETCH:ALL_S? -> [$resp]"
exec 3>&-

echo ""
echo "=== Test 2: FUNC:STOP first, then user's manual mode, then FETCH ==="
exec 3<>/dev/tcp/$HOST/$PORT 2>/dev/null
echo -e "FUNC:STOP\r" >&3
read -t 2 resp <&3 2>/dev/null
echo "FUNC:STOP -> [$resp]"
sleep 2
echo -e "FETCH:ALL_S?\r" >&3
read -t 3 resp <&3 2>/dev/null
echo "FETCH(after stop) -> [$resp]"
exec 3>&-

echo ""
echo "=== Test 3: TRIG + FETCH on same connection ==="
exec 3<>/dev/tcp/$HOST/$PORT 2>/dev/null
echo -e "TRIG\r" >&3
read -t 2 resp <&3 2>/dev/null
echo "TRIG -> [$resp]"
sleep 2
echo -e "FETCH:ALL_S?\r" >&3
read -t 3 resp <&3 2>/dev/null
echo "FETCH(after trig) -> [$resp]"
exec 3>&-

echo ""
echo "=== Test 4: FUNC:RUN + multiple FETCH with delays on same conn ==="
exec 3<>/dev/tcp/$HOST/$PORT 2>/dev/null
echo -e "FUNC:RUN\r" >&3
read -t 2 resp <&3 2>/dev/null
echo "FUNC:RUN -> [$resp]"
for i in 1 2 3 4 5; do
    sleep 2
    echo -e "FETCH:ALL_S?\r" >&3
    read -t 3 resp <&3 2>/dev/null
    echo "FETCH[$i] -> [$resp]"
done
exec 3>&-

echo ""
echo "=== Test 5: *RST + FUNC:RUN + FETCH on same conn ==="
exec 3<>/dev/tcp/$HOST/$PORT 2>/dev/null
echo -e "*RST\r" >&3
read -t 2 resp <&3 2>/dev/null
echo "*RST -> [$resp]"
sleep 2
echo -e "FUNC:RUN\r" >&3
read -t 2 resp <&3 2>/dev/null
echo "FUNC:RUN -> [$resp]"
sleep 3
echo -e "FETCH:ALL_S?\r" >&3
read -t 3 resp <&3 2>/dev/null
echo "FETCH(after rst+run) -> [$resp]"
exec 3>&-

echo ""
echo "=== DONE ==="
