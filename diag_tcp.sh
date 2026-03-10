#!/bin/bash
# Diagnostic: test SCPI commands on TH2690 via /dev/tcp (bash built-in)
# Run on host: bash /tmp/diag_tcp.sh
HOST=192.168.1.150
PORT=45454

send_cmd() {
    local cmd="$1"
    local resp
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
echo "=== 2. Remote mode commands ==="
send_cmd "SYST:REM"
send_cmd "SYST:RWL"
send_cmd "SYSTem:REMote"
send_cmd ":SYST:REM"

echo ""
echo "=== 3. Zero Check (CRITICAL) ==="
send_cmd "SYST:ZCH?"
send_cmd "SYST:ZCH OFF"
send_cmd "SYST:ZCH 0"
send_cmd "INP:ZCH OFF"
send_cmd "ZCHK OFF"
send_cmd "ZCHK:STAT OFF"
send_cmd "ZCHK:STAT?"
send_cmd ":SYST:ZCH OFF"
send_cmd "KEY ZCHK"
send_cmd "ZCOR OFF"

echo ""
echo "=== 4. Query state ==="
send_cmd "FUNC?"
send_cmd "SOUR:VOLT?"
send_cmd "SOUR:STAT?"
send_cmd "RANG:AUTO?"
send_cmd "STAT?"
send_cmd "MEAS?"

echo ""
echo "=== 5. FETCH variants ==="
send_cmd "FETCH:ALL_S?"
send_cmd "FETCH?"
send_cmd "READ?"
send_cmd "MEAS:CURR?"
send_cmd "MEAS:RES?"
send_cmd "DATA?"
send_cmd "FETC?"

echo ""
echo "=== 6. Start + Fetch ==="
send_cmd "FUNC:RUN"
sleep 2
send_cmd "FETCH:ALL_S?"

echo ""
echo "=== 7. System info ==="
send_cmd "SYST:ERR?"
send_cmd "SYST:VERS?"
send_cmd "*OPC?"
send_cmd "*TST?"
send_cmd "SYST:HELP?"

echo ""
echo "=== DONE ==="
