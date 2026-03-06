#!/bin/bash
TOKEN=$(curl -s -X POST http://localhost:8080/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8080/instruments/1/probe | python3 -m json.tool
