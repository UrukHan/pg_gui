#!/bin/bash
TOKEN=$(curl -s -X POST http://localhost:8080/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"login":"admin","password":"admin"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')

curl -s -o /tmp/exp50.csv \
  -H "Authorization: Bearer $TOKEN" \
  'http://localhost:8080/experiments/50/csv'

python3 << 'PYEOF'
import csv

with open("/tmp/exp50.csv", "r", encoding="utf-8-sig") as f:
    reader = csv.reader(f)
    header = next(reader)
    print(f"Header columns ({len(header)}): {header}")
    
    inst_count = {}
    inst_time_range = {}
    total = 0
    bad_rows = 0
    for i, row in enumerate(reader):
        total += 1
        if len(row) != len(header):
            bad_rows += 1
            if bad_rows <= 3:
                print(f"  BAD ROW #{i+2}: {len(row)} cols, data={row[:5]}...")
            continue
        inst_id = row[2]
        ts = row[3]
        inst_count[inst_id] = inst_count.get(inst_id, 0) + 1
        if inst_id not in inst_time_range:
            inst_time_range[inst_id] = [ts, ts]
        else:
            inst_time_range[inst_id][1] = ts

    print(f"\nTotal data rows: {total}")
    print(f"Bad rows: {bad_rows}")
    for inst_id in sorted(inst_count.keys()):
        r = inst_time_range[inst_id]
        print(f"  instrument_id={inst_id}: {inst_count[inst_id]} rows, from={r[0][:19]} to={r[1][:19]}")

    # Check for Excel issues: semicolons in data, long numbers, etc.
    print(f"\nSample row 2 (raw):")
    f.seek(0)
    lines = f.readlines()
    print(f"  {lines[1].strip()}")
    print(f"  {lines[2].strip()}")
    
    # Check if current values have scientific notation that Excel might misparse
    print(f"\nSample current values (rows 2-6):")
    f.seek(0)
    reader2 = csv.reader(f)
    next(reader2)
    for j, row in enumerate(reader2):
        if j >= 5: break
        print(f"  row {j+2}: current={row[5]}, voltage={row[4]}, source={row[10]}")
PYEOF
