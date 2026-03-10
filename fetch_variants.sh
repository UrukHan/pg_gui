#!/bin/bash
# Try ALL possible FETCH/READ command variants on TH2690
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

echo "=== FETCH variants ==="
send_cmd "FETCH:ALL_S?"
send_cmd "FETCH:ALL?"
send_cmd "FETCH:CURR?"
send_cmd "FETCH:CURR_S?"
send_cmd "FETCH:RES?"
send_cmd "FETCH:RES_S?"
send_cmd "FETCH:CHAR?"
send_cmd "FETCH:VOLT?"
send_cmd "FETCH:VOLT_S?"
send_cmd "FETCH:DATA?"
send_cmd "FETCH:LAST?"
send_cmd "FETCH:IMP?"
send_cmd "FETC?"
send_cmd "FETCH?"

echo ""
echo "=== READ/MEAS/DATA variants ==="
send_cmd "READ?"
send_cmd "READ:ALL?"
send_cmd "READ:ALL_S?"
send_cmd "READ:CURR?"
send_cmd "READ:DATA?"
send_cmd "MEAS?"
send_cmd "MEAS:CURR?"
send_cmd "MEAS:ALL?"
send_cmd "DATA?"
send_cmd "DATA:ALL?"
send_cmd "VAL?"
send_cmd "CALC?"
send_cmd "CALC:DATA?"
send_cmd "DISP?"
send_cmd "DISP:DATA?"
send_cmd "DISP:TEXT?"

echo ""
echo "=== SENSE/INPUT variants ==="
send_cmd "SENS?"
send_cmd "SENS:DATA?"
send_cmd "SENS:CURR?"
send_cmd "INP?"
send_cmd "INP:DATA?"

echo ""
echo "=== TRIG/INIT + FETCH ==="
send_cmd "INIT"
sleep 1
send_cmd "FETCH:ALL_S?"
send_cmd "TRIG"
sleep 1
send_cmd "FETCH:ALL_S?"
send_cmd "INIT:IMM"
sleep 1
send_cmd "FETCH:ALL_S?"

echo ""
echo "=== FUNC:RUN then FETCH ==="
send_cmd "FUNC:RUN"
sleep 2
send_cmd "FETCH:ALL_S?"

echo ""
echo "=== DONE ==="
