#!/bin/bash
HOST=192.168.1.150
PORT=45454

send_cmd() {
    local cmd="$1"
    exec 3<>/dev/tcp/$HOST/$PORT 2>/dev/null
    echo -e "${cmd}\r" >&3
    read -t 3 resp <&3 2>/dev/null
    exec 3>&-
    resp=$(echo "$resp" | tr -d '\r\n')
    echo "CMD: [$cmd] -> [$resp]"
}

echo "=== Resetting TH2690 to idle state ==="
send_cmd "FUNC:STOP"
send_cmd "FUNC:SRC OFF"
send_cmd "FUNC:AMMET OFF"
send_cmd "SRC:VALUE 0"
echo "=== Verify ==="
send_cmd "FUNC:SRC?"
send_cmd "FUNC:AMMET?"
send_cmd "SRC:VALUE?"
echo "=== Done. Instrument ready for UI control ==="
