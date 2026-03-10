#!/bin/bash
# Diagnostic: test all possible SCPI commands on TH2690
# Run inside Docker container: docker exec pg-ariadna-back bash /tmp/diag_remote.sh
HOST=192.168.1.150
PORT=45454

send_cmd() {
    local cmd="$1"
    local resp
    resp=$(echo -e "${cmd}\r\n" | timeout 3 nc -w2 "$HOST" "$PORT" 2>/dev/null)
    echo "CMD: [$cmd] -> RESP: [$resp]"
}

echo "=== 1. Identity ==="
send_cmd "*IDN?"

echo ""
echo "=== 2. Try REMOTE mode commands ==="
send_cmd "SYST:REM"
send_cmd "SYST:RWL"
send_cmd "SYSTem:REMote"
send_cmd ":SYST:REM"

echo ""
echo "=== 3. Zero Check commands (CRITICAL - this causes zeros!) ==="
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
echo "=== 4. Query current function/state ==="
send_cmd "FUNC?"
send_cmd "SOUR:VOLT?"
send_cmd "SOUR:STAT?"
send_cmd "RANG:AUTO?"
send_cmd "STAT?"
send_cmd "MEAS?"

echo ""
echo "=== 5. Try FETCH variants ==="
send_cmd "FETCH:ALL_S?"
send_cmd "FETCH?"
send_cmd "READ?"
send_cmd "MEAS:CURR?"
send_cmd "MEAS:RES?"

echo ""
echo "=== 6. Try starting measurement ==="
send_cmd "FUNC:RUN"
sleep 1
send_cmd "FETCH:ALL_S?"

echo ""
echo "=== 7. System info commands ==="
send_cmd "SYST:ERR?"
send_cmd "SYST:VERS?"
send_cmd "*OPC?"
send_cmd "*TST?"
send_cmd "HELP?"
send_cmd "SYST:HELP?"

echo ""
echo "=== DONE ==="
