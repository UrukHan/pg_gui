#!/bin/sh
HOST=192.168.1.150
PORT=45454

probe() {
  CMD="$1"
  RESP=$(echo -e "${CMD}\r" | timeout 3 nc $HOST $PORT 2>&1)
  echo "CMD=[$CMD] -> [$RESP]"
}

echo "=== Zero Check related commands ==="
probe "ZCHK?"
probe "ZCHK OFF"
probe "ZCHK:STAT?"
probe "ZCHK:STAT OFF"
probe "SYST:ZCH?"
probe "SYST:ZCH OFF"
probe "SYST:ZCHK?"
probe "SYST:ZCHK OFF"
probe "ZERO:CHK?"
probe "ZERO:CHK OFF"
probe "ZERO:CHEK?"
probe "ZERO:CHEK OFF"
probe "ZERO:STAT?"
probe "ZERO:STAT OFF"

echo "=== Try to set function ==="
probe "FUNC:CURR"
probe "FUNC:CURR:DC"
probe "CURR:DC"
probe "CONF:CURR"

echo "=== Query after changes ==="
probe "FETCH:ALL_S?"

echo "=== Try alternate data commands ==="
probe "TRIG:SOUR IMM"
probe "INIT"
sleep 1
probe "FETCH?"
probe "FETCH:ALL_S?"

echo "=== Key simulation commands ==="
probe "KEY:RUN"
probe "KEY:ZCHK"
probe "KEY RUN"
probe "KEY ZCHK"
probe "DISP:TEXT?"
probe "DISP?"
