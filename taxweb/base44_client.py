"""
Base44 API client for TaximizerPro
"""
import json, urllib.request, urllib.parse, os

APP_ID  = "6a13ae4b43ea85cec629af77"
API_KEY = os.environ.get("BASE44_API_KEY", "")
BASE    = f"https://api.base44.com/api/apps/{APP_ID}/entities"

HEADERS = {
    "app-id": APP_ID,
    "Content-Type": "application/json"
}
if API_KEY:
    HEADERS["x-api-key"] = API_KEY

def _get(path, params=None):
    url = BASE + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

def _patch(path, data):
    body = json.dumps(data).encode()
    req = urllib.request.Request(BASE + path, data=body, method='PATCH', headers=HEADERS)
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

def get_clients(status=None, limit=50, skip=0):
    params = {'limit': limit, 'skip': skip}
    if status:
        params['filing_status'] = status
    return _get('/TaxClient', params)

def get_all_clients():
    all_records = []
    skip = 0
    while True:
        result = get_clients(limit=200, skip=skip)
        records = result if isinstance(result, list) else result.get('records', result if isinstance(result, list) else [])
        if not records:
            break
        all_records.extend(records)
        if len(records) < 200:
            break
        skip += 200
    return all_records

def get_client(client_id):
    result = _get(f'/TaxClient/{client_id}')
    return result

def mark_filed(client_id):
    return _patch(f'/TaxClient/{client_id}', {'filing_status': 'filed'})
