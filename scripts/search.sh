curl -X POST "https://api.datadoghq.eu/api/v2/logs/events/search" \
-H "Content-Type: application/json" \
-H "DD-API-KEY: ${DD_API_KEY}" \
-H "DD-APPLICATION-KEY: ${DD_APP_KEY}" \
-d @- << EOF
{"filter":{"from":"2022-11-21T16:40:00.000Z", "to":"2022-11-21T16:42:00.000Z","query":"","indexes":["nov-21-service-avw"]}}
EOF
