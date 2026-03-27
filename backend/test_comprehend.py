import requests
import json

base_url = "http://localhost:8000"
resp = requests.post(f"{base_url}/auth/login", data={"username": "demo_hospital", "password": "password123"})
if not resp.ok:
    print("Login failed:", resp.text)
    exit(1)

token = resp.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

claims_resp = requests.get(f"{base_url}/claims", headers=headers)
claims = claims_resp.json()
if not claims:
    print("No claims found.")
    exit(0)

claim_id = claims[0]["id"]
print(f"Testing claim {claim_id}")

comp_resp = requests.get(f"{base_url}/claims/{claim_id}/comprehend", headers=headers)
print("Status Code:", comp_resp.status_code)
print("Response:", comp_resp.text)
