#!/bin/bash
# Test TH2690 with CORRECT command syntax from official manual
HOST=192.168.1.150
PORT=45454

send_cmd() {
    local cmd="$1"
    exec 3<>/dev/tcp/$HOST/$PORT 2>/dev/null
    if [ $? -ne 0 ]; then
        echo "CMD: [$cmd] -> CONNECT FAILED"
        return
    fi
    echo -e "${cmd}\r" >&3
    read -t 3 resp <&3 2>/dev/null
    exec 3>&-
    resp=$(echo "$resp" | tr -d '\r\n')
    echo "CMD: [$cmd] -> [$resp]"
}

echo "=== 1. Identity ==="
send_cmd "*IDN?"

echo ""
echo "=== 2. CORRECT FUNC commands (FUNC:FUNC, FUNC:SRC, FUNC:AMMET) ==="
send_cmd "FUNC:FUNC?"
send_cmd "FUNC:FUNC CURR"
send_cmd "FUNC:SRC?"
send_cmd "FUNC:SRC ON"
send_cmd "FUNC:AMMET?"
send_cmd "FUNC:AMMET ON"
send_cmd "FUNC:ZERO?"
send_cmd "FUNC:ZERO OFF"

echo ""
echo "=== 3. CORRECT SRC commands (SRC:VALUE, SRC:RANGE) ==="
send_cmd "SRC:VALUE?"
send_cmd "SRC:RANGE?"
send_cmd "SRC:VALUE 700"
send_cmd "SRC:RANGE 2"

echo ""
echo "=== 4. CORRECT CURR commands (CURR:RANGE, CURR:SPEED) ==="
send_cmd "CURR:RANGE?"
send_cmd "CURR:RANGE 1"
send_cmd "CURR:SPEED?"
send_cmd "CURR:SPEED MID"

echo ""
echo "=== 5. DISP page ==="
send_cmd "DISP:PAGE?"
send_cmd "DISP:PAGE MEAS"

echo ""
echo "=== 6. START measurement ==="
send_cmd "FUNC:RUN"
echo "Waiting 3s..."
sleep 3

echo ""
echo "=== 7. FETCH data ==="
for i in 1 2 3 4 5; do
    send_cmd "FETCH:ALL_S?"
    sleep 1
done

echo ""
echo "=== 8. Individual FETCH ==="
send_cmd "FETCH:CURR?"
send_cmd "FETCH:VOLT?"
send_cmd "FETCH:RES?"
send_cmd "FETCH:SOUR?"

echo ""
echo "=== DONE ==="
