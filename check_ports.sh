#!/bin/bash
for ip in 150 151 152; do
  timeout 3 bash -c "echo -e '*IDN?\r' > /dev/tcp/192.168.1.$ip/45454 && echo $ip:OPEN" 2>/dev/null || echo "$ip:CLOSED"
done
