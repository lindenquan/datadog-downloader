## Usage

### Unix like OS
```
export DD_SITE='datadoghq.com' # or DD_SITE='datadoghq.eu'
export DD_API_KEY=''
export DD_APP_KEY=''
export DD_INDEX='main'
export DD_FROM='2023-02-06T03:24:00Z'    # ISO 8601 format with timezone 
export DD_TO='2023-02-06T03:24:00-05:30' # ISO 8601 format with timezone 
export DD_OUTPUT='exported.csv'          # extension must be csv
export DD_QUERY='service:*'
export DD_SLEEP='1000'                   # time unit is ms

npm exec dd-downloader
```
### Windows
```
set DD_SITE=datadoghq.com
set DD_API_KEY=api-key
set DD_APP_KEY=app-key
set DD_INDEX=main
set DD_FROM=2023-02-06T03:24:00Z
set DD_TO=2023-02-06T03:25:00Z
set DD_OUTPUT=exported.csv
set DD_QUERY=service:*
set DD_SLEEP=1000

npm exec dd-downloader
```
