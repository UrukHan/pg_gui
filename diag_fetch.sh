#!/bin/sh
# Diagnostic: try multiple fetch/query commands on TH2690
HOST=192.168.1.150
PORT=45454

probe() {
  CMD="$1"
  # Use Go's Send via a temp Go program inside the container
  RESP=$(echo -e "${CMD}\r" | timeout 3 nc $HOST $PORT 2>&1)
  echo "CMD=[$CMD] -> [$RESP]"
}

echo "=== Queries ==="
probe "*IDN?"
probe "FUNC?"
probe "FUNC:STAT?"
probe "FETCH?"
probe "FETCH:ALL?"
probe "FETCH:ALL_S?"
probe "READ?"
probe "MEAS?"
probe "MEAS:CURR?"
probe "DATA?"
probe "DATA:LAST?"
probe "SENS:DATA?"
probe "SENS:FUNC?"
probe "STAT:OPER?"
probe "SYST:ERR?"
probe "SOUR:VOLT?"
probe "SOUR:STAT?"
probe "RANG:AUTO?"
probe "SPEED?"
echo "=== Try RUN then FETCH ==="
probe "FUNC:RUN"
sleep 2
probe "FETCH:ALL_S?"
probe "FETCH?"
probe "READ?"
