#!/bin/sh
HOST=192.168.1.150
PORT=45454

probe() {
  CMD="$1"
  RESP=$(echo -e "${CMD}\r" | timeout 2 nc $HOST $PORT 2>&1)
  echo "CMD=[$CMD] RESP=[$RESP]"
}

probe "FUNC?"
probe "FUNC CURR"
probe ":FUNC CURR"
probe "SPEED?"
probe "SPEED MED"
probe ":SPEED MED"
probe "RATE?"
probe "RANG:AUTO?"
probe "RANG:AUTO ON"
probe ":RANG:AUTO ON"
probe "SOUR:VOLT?"
probe "SOUR:VOLT 100"
probe ":SOUR:VOLT 100"
probe "SOUR:STAT?"
probe "SOUR:STAT ON"
probe ":SOUR:STAT ON"
probe "OUTP?"
probe "OUTP ON"
probe ":OUTP ON"
probe "ZERO:CORR?"
probe "ZERO:CORR"
probe ":ZERO:CORR"
probe "SYST:ZCOR?"
probe "*IDN?"
probe "FETCH:ALL_S?"
